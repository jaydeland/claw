import { shell } from "electron";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { isUpstreamMissingError } from "./git-utils";
import { assertRegisteredWorktree } from "./security";
import { fetchGitHubPRStatus } from "./github";
import {
	createGit,
	createGitForNetwork,
	withGitLock,
	withLockRetry,
	hasUncommittedChanges,
	getRepositoryState,
	GIT_TIMEOUTS,
} from "./git-factory";

export { isUpstreamMissingError };

async function hasUpstreamBranch(
	git: ReturnType<typeof simpleGit>,
): Promise<boolean> {
	try {
		await git.raw(["rev-parse", "--abbrev-ref", "@{upstream}"]);
		return true;
	} catch {
		return false;
	}
}

/** Protected branches that should not be force-pushed to */
const PROTECTED_BRANCHES = ["main", "master", "develop", "production", "staging"];

/**
 * Check if a branch is checked out in any worktree and return the worktree path if so.
 * @param git - simple-git instance
 * @param branchName - The branch name to check
 * @returns The worktree path where the branch is checked out, or null if not checked out
 */
async function getBranchWorktreePath(
	git: ReturnType<typeof simpleGit>,
	branchName: string,
): Promise<string | null> {
	try {
		const worktreeList = await git.raw(["worktree", "list", "--porcelain"]);
		const lines = worktreeList.split("\n");

		let currentWorktree: string | null = null;

		for (const line of lines) {
			if (line.startsWith("worktree ")) {
				currentWorktree = line.substring(9); // Remove "worktree " prefix
			} else if (line.startsWith("branch refs/heads/")) {
				const branch = line.substring(18); // Remove "branch refs/heads/" prefix
				if (branch === branchName && currentWorktree) {
					return currentWorktree;
				}
			}
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Check if a fast-forward merge is possible from source to target branch.
 * @param git - simple-git instance
 * @param sourceBranch - The branch to merge from
 * @param targetBranch - The branch to merge into
 * @returns Object indicating if fast-forward is possible and if already up-to-date
 */
async function canFastForward(
	git: ReturnType<typeof simpleGit>,
	sourceBranch: string,
	targetBranch: string,
): Promise<{ canFF: boolean; alreadyUpToDate: boolean }> {
	try {
		// Get the commit hashes
		const sourceCommit = (await git.revparse([sourceBranch])).trim();
		const targetCommit = (await git.revparse([targetBranch])).trim();

		// If they're the same, already up to date
		if (sourceCommit === targetCommit) {
			return { canFF: true, alreadyUpToDate: true };
		}

		// Check if target is an ancestor of source (meaning we can fast-forward)
		try {
			await git.raw(["merge-base", "--is-ancestor", targetBranch, sourceBranch]);
			return { canFF: true, alreadyUpToDate: false };
		} catch {
			// Not an ancestor, can't fast-forward
			return { canFF: false, alreadyUpToDate: false };
		}
	} catch {
		return { canFF: false, alreadyUpToDate: false };
	}
}

export const createGitOperationsRouter = () => {
	return router({
		// NOTE: saveFile is defined in file-contents.ts with hardened path validation
		// Do NOT add saveFile here - it would overwrite the secure version

		fetch: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				return withGitLock(input.worktreePath, async () => {
					const git = createGitForNetwork(input.worktreePath);
					await withLockRetry(input.worktreePath, () =>
						git.fetch(["--all", "--prune"])
					);
					return { success: true };
				});
			}),

		checkout: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					branch: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				return withGitLock(input.worktreePath, async () => {
					// Check for uncommitted changes before checkout
					if (await hasUncommittedChanges(input.worktreePath)) {
						throw new Error(
							"Cannot switch branches: you have uncommitted changes. Please commit or stash your changes first."
						);
					}

					const git = createGit(input.worktreePath);
					await withLockRetry(input.worktreePath, () =>
						git.checkout(input.branch)
					);
					return { success: true };
				});
			}),

		getHistory: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					limit: z.number().optional().default(50),
				}),
			)
			.query(
				async ({
					input,
				}): Promise<
					Array<{
						hash: string;
						shortHash: string;
						message: string;
						author: string;
						email: string;
						date: Date;
					}>
				> => {
					assertRegisteredWorktree(input.worktreePath);

					const git = createGit(input.worktreePath);
					const logOutput = await git.raw([
						"log",
						`-${input.limit}`,
						"--format=%H|%h|%s|%an|%ae|%aI",
					]);

					if (!logOutput.trim()) return [];

					return logOutput
						.trim()
						.split("\n")
						.map((line) => {
							const [hash, shortHash, message, author, email, dateStr] =
								line.split("|");
							return {
								hash: hash || "",
								shortHash: shortHash || "",
								message: message || "",
								author: author || "",
								email: email || "",
								date: new Date(dateStr || ""),
							};
						});
				},
			),

		commit: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					message: z.string(),
				}),
			)
			.mutation(
				async ({ input }): Promise<{ success: boolean; hash: string }> => {
					assertRegisteredWorktree(input.worktreePath);

					// Validate message
					if (!input.message.trim()) {
						throw new Error("Commit message cannot be empty");
					}

					return withGitLock(input.worktreePath, async () => {
						const git = createGit(input.worktreePath);

						// Check that there are staged changes
						const status = await git.status();
						if (status.staged.length === 0) {
							throw new Error("No files staged for commit");
						}

						const result = await withLockRetry(input.worktreePath, () =>
							git.commit(input.message)
						);
						return { success: true, hash: result.commit };
					});
				},
			),

		// Atomic commit: stage specific files and commit in one operation
		atomicCommit: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePaths: z.array(z.string()),
					message: z.string(),
				}),
			)
			.mutation(
				async ({ input }): Promise<{ success: boolean; hash: string }> => {
					assertRegisteredWorktree(input.worktreePath);

					// Validate message
					if (!input.message.trim()) {
						throw new Error("Commit message cannot be empty");
					}

					// Validate files
					if (input.filePaths.length === 0) {
						throw new Error("No files selected for commit");
					}

					return withGitLock(input.worktreePath, async () => {
						const git = createGit(input.worktreePath);

						// First, unstage everything to start fresh
						await withLockRetry(input.worktreePath, () =>
							git.reset(["HEAD"])
						);

						// Stage only the selected files
						await withLockRetry(input.worktreePath, () =>
							git.add(["--", ...input.filePaths])
						);

						// Verify files were staged
						const status = await git.status();
						if (status.staged.length === 0) {
							throw new Error("Failed to stage files for commit");
						}

						// Commit
						const result = await withLockRetry(input.worktreePath, () =>
							git.commit(input.message)
						);

						return { success: true, hash: result.commit };
					});
				},
			),

		push: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					setUpstream: z.boolean().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				return withGitLock(input.worktreePath, async () => {
					const git = createGitForNetwork(input.worktreePath);
					const hasUpstream = await hasUpstreamBranch(git);

					if (input.setUpstream && !hasUpstream) {
						const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
						await withLockRetry(input.worktreePath, () =>
							git.push(["--set-upstream", "origin", branch.trim()])
						);
					} else {
						await withLockRetry(input.worktreePath, () => git.push());
					}
					await git.fetch();
					return { success: true };
				});
			}),

		pull: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					autoStash: z.boolean().optional().default(false),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				return withGitLock(input.worktreePath, async () => {
					const git = createGitForNetwork(input.worktreePath);

					// Safety check: prevent pull with uncommitted changes (data loss risk)
					const hasChanges = await hasUncommittedChanges(input.worktreePath);
					if (hasChanges && !input.autoStash) {
						throw new Error(
							"Cannot pull with uncommitted changes. Please commit or stash your changes first, or enable auto-stash."
						);
					}

					// Check for ongoing rebase/merge
					const repoState = await getRepositoryState(input.worktreePath);
					if (repoState.isRebasing || repoState.isMerging) {
						throw new Error(
							"Cannot pull: a rebase or merge is in progress. Please complete or abort it first."
						);
					}

					try {
						if (input.autoStash && hasChanges) {
							// Stash changes before pull
							await git.stash(["push", "-m", "Auto-stash before pull"]);
						}

						await withLockRetry(input.worktreePath, () =>
							git.pull(["--rebase"])
						);

						if (input.autoStash && hasChanges) {
							// Pop stashed changes
							try {
								await git.stash(["pop"]);
							} catch (stashError) {
								// Stash pop failed (likely conflict)
								throw new Error(
									"Pull succeeded but failed to restore your stashed changes. Your changes are saved in git stash. Run 'git stash pop' to restore them."
								);
							}
						}
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						if (isUpstreamMissingError(message)) {
							throw new Error(
								"No upstream branch to pull from. The remote branch may have been deleted.",
							);
						}
						// Check for rebase conflicts
						if (message.includes("CONFLICT") || message.includes("could not apply")) {
							// Abort the rebase
							await git.rebase(["--abort"]).catch(() => {});
							throw new Error(
								"Pull failed due to conflicts. The operation has been aborted. Please resolve conflicts manually or try a different approach."
							);
						}
						throw error;
					}
					return { success: true };
				});
			}),

		sync: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					autoStash: z.boolean().optional().default(false),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				return withGitLock(input.worktreePath, async () => {
					const git = createGitForNetwork(input.worktreePath);

					// Safety check: prevent sync with uncommitted changes
					const hasChanges = await hasUncommittedChanges(input.worktreePath);
					if (hasChanges && !input.autoStash) {
						throw new Error(
							"Cannot sync with uncommitted changes. Please commit or stash your changes first."
						);
					}

					// Check for ongoing rebase/merge
					const repoState = await getRepositoryState(input.worktreePath);
					if (repoState.isRebasing || repoState.isMerging) {
						throw new Error(
							"Cannot sync: a rebase or merge is in progress. Please complete or abort it first."
						);
					}

					try {
						if (input.autoStash && hasChanges) {
							await git.stash(["push", "-m", "Auto-stash before sync"]);
						}

						await withLockRetry(input.worktreePath, () =>
							git.pull(["--rebase"])
						);

						if (input.autoStash && hasChanges) {
							try {
								await git.stash(["pop"]);
							} catch {
								throw new Error(
									"Sync pull succeeded but failed to restore your stashed changes. Your changes are saved in git stash."
								);
							}
						}
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						if (isUpstreamMissingError(message)) {
							const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
							await withLockRetry(input.worktreePath, () =>
								git.push(["--set-upstream", "origin", branch.trim()])
							);
							await git.fetch();
							return { success: true };
						}
						// Check for rebase conflicts
						if (message.includes("CONFLICT") || message.includes("could not apply")) {
							await git.rebase(["--abort"]).catch(() => {});
							throw new Error(
								"Sync failed due to conflicts. The operation has been aborted. Please resolve conflicts manually."
							);
						}
						throw error;
					}
					await withLockRetry(input.worktreePath, () => git.push());
					await git.fetch();
					return { success: true };
				});
			}),

		forcePush: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					confirmProtectedBranch: z.boolean().optional().default(false),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				return withGitLock(input.worktreePath, async () => {
					const git = createGitForNetwork(input.worktreePath);

					// Get current branch
					const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();

					// Check if it's a protected branch
					if (PROTECTED_BRANCHES.includes(branch) && !input.confirmProtectedBranch) {
						throw new Error(
							`Cannot force push to protected branch '${branch}'. This action requires explicit confirmation.`
						);
					}

					await withLockRetry(input.worktreePath, () =>
						git.push(["--force-with-lease"])
					);
					await git.fetch();
					return { success: true };
				});
			}),

		mergeFromDefault: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					useRebase: z.boolean().optional().default(false),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				return withGitLock(input.worktreePath, async () => {
					const git = createGitForNetwork(input.worktreePath);

					// Safety check: prevent merge/rebase with uncommitted changes
					if (await hasUncommittedChanges(input.worktreePath)) {
						throw new Error(
							"Cannot merge/rebase with uncommitted changes. Please commit or stash your changes first."
						);
					}

					// Check for ongoing rebase/merge
					const repoState = await getRepositoryState(input.worktreePath);
					if (repoState.isRebasing || repoState.isMerging) {
						throw new Error(
							"Cannot merge/rebase: another merge or rebase is in progress. Please complete or abort it first."
						);
					}

					// Fetch latest from remote first
					await withLockRetry(input.worktreePath, () =>
						git.fetch(["--all"])
					);

					// Determine default branch (main or master)
					let defaultBranch = "main";
					try {
						await git.raw(["rev-parse", "--verify", "origin/main"]);
					} catch {
						try {
							await git.raw(["rev-parse", "--verify", "origin/master"]);
							defaultBranch = "master";
						} catch {
							throw new Error("Could not find default branch (main or master)");
						}
					}

					try {
						if (input.useRebase) {
							await withLockRetry(input.worktreePath, () =>
								git.rebase([`origin/${defaultBranch}`])
							);
						} else {
							await withLockRetry(input.worktreePath, () =>
								git.merge([`origin/${defaultBranch}`, "--no-edit"])
							);
						}
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);

						// Check for conflicts
						if (
							message.includes("CONFLICT") ||
							message.includes("could not apply") ||
							message.includes("merge failed")
						) {
							// Abort the operation
							if (input.useRebase) {
								await git.rebase(["--abort"]).catch(() => {});
							} else {
								await git.merge(["--abort"]).catch(() => {});
							}
							throw new Error(
								`${input.useRebase ? "Rebase" : "Merge"} failed due to conflicts. The operation has been aborted. Please resolve conflicts manually or use a different strategy.`
							);
						}
						throw error;
					}

					return { success: true };
				});
			}),

		mergeIntoLocalBranch: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					targetBranch: z.string(),
					fastForwardOnly: z.boolean().optional().default(false),
				}),
			)
			.mutation(
				async ({ input }): Promise<{
					success: boolean;
					mergeType: "fast-forward" | "merge-commit" | "already-up-to-date";
				}> => {
					assertRegisteredWorktree(input.worktreePath);

					return withGitLock(input.worktreePath, async () => {
						const git = createGit(input.worktreePath);

						// Get current branch (this is the source branch we're merging FROM)
						const sourceBranch = (
							await git.revparse(["--abbrev-ref", "HEAD"])
						).trim();

						// Validation: cannot merge into itself
						if (sourceBranch === input.targetBranch) {
							throw new Error(
								"Cannot merge current branch into itself"
							);
						}

						// Safety check: prevent merge with uncommitted changes in this worktree
						if (await hasUncommittedChanges(input.worktreePath)) {
							throw new Error(
								"Cannot merge with uncommitted changes. Please commit or stash your changes first."
							);
						}

						// Check for ongoing rebase/merge
						const repoState = await getRepositoryState(
							input.worktreePath
						);
						if (repoState.isRebasing || repoState.isMerging) {
							throw new Error(
								"Cannot merge: another merge or rebase is in progress. Please complete or abort it first."
							);
						}

						// Note: No protected branch restriction for local merges.
						// Protection rules don't apply locally - users can merge into any branch.

						// Verify target branch exists locally
						const branchSummary = await git.branch(["-a"]);
						if (
							!Object.keys(branchSummary.branches).includes(
								input.targetBranch
							)
						) {
							throw new Error(
								`Target branch '${input.targetBranch}' does not exist locally`
							);
						}

						// Check if fast-forward is possible
						const ffCheck = await canFastForward(git, sourceBranch, input.targetBranch);

						if (ffCheck.alreadyUpToDate) {
							return { success: true, mergeType: "already-up-to-date" };
						}

						// If fast-forward only was requested but can't FF
						if (input.fastForwardOnly && !ffCheck.canFF) {
							throw new Error(
								`Cannot fast-forward: branch '${input.targetBranch}' has diverged from '${sourceBranch}'. ` +
								`The branches have different commits and require a merge commit.`
							);
						}

						// Find where the target branch is checked out
						const targetWorktreePath = await getBranchWorktreePath(git, input.targetBranch);

						if (targetWorktreePath) {
							// Target branch is checked out in a worktree - merge from there
							// Check for uncommitted changes in the target worktree
							if (await hasUncommittedChanges(targetWorktreePath)) {
								throw new Error(
									`Cannot merge into '${input.targetBranch}': the target worktree at '${targetWorktreePath}' has uncommitted changes. ` +
									`Please commit or stash those changes first.`
								);
							}

							// Check for ongoing rebase/merge in target worktree
							const targetRepoState = await getRepositoryState(targetWorktreePath);
							if (targetRepoState.isRebasing || targetRepoState.isMerging) {
								throw new Error(
									`Cannot merge into '${input.targetBranch}': the target worktree has a rebase or merge in progress. ` +
									`Please complete or abort it first.`
								);
							}

							// Create a git instance for the target worktree and run merge there
							const targetGit = createGit(targetWorktreePath);

							try {
								// Merge the source branch into target (from target's perspective)
								const mergeArgs = [sourceBranch, "--no-edit"];
								if (input.fastForwardOnly) {
									mergeArgs.push("--ff-only");
								}

								await withLockRetry(targetWorktreePath, () =>
									targetGit.merge(mergeArgs)
								);

								// Determine merge type
								if (ffCheck.canFF) {
									return { success: true, mergeType: "fast-forward" };
								}
								return { success: true, mergeType: "merge-commit" };
							} catch (error) {
								const message =
									error instanceof Error
										? error.message
										: String(error);

								// Check for conflicts
								if (
									message.includes("CONFLICT") ||
									message.includes("merge failed") ||
									message.includes("could not apply")
								) {
									// Abort the merge
									await targetGit.merge(["--abort"]).catch(() => {});
									throw new Error(
										`Merge failed due to conflicts. Operation aborted. ` +
										`To resolve manually, go to '${targetWorktreePath}' and run: git merge ${sourceBranch}`
									);
								}

								// Check for fast-forward only failure
								if (
									input.fastForwardOnly &&
									message.includes("fatal: Not possible to fast-forward")
								) {
									throw new Error(
										"Cannot fast-forward: target branch has diverged. Try without fast-forward only option."
									);
								}

								throw error;
							}
						}

						// Target branch is NOT checked out anywhere - we need to check it out to merge
						// This is the fallback path for branches not in any worktree
						let mergeType: "fast-forward" | "merge-commit" | "already-up-to-date" =
							"merge-commit";

						try {
							// Switch to target branch
							await withLockRetry(input.worktreePath, () =>
								git.checkout(input.targetBranch)
							);

							// Merge source branch into target
							const mergeArgs = [sourceBranch, "--no-edit"];
							if (input.fastForwardOnly) {
								mergeArgs.push("--ff-only");
							}

							await withLockRetry(input.worktreePath, () =>
								git.merge(mergeArgs)
							);

							// Determine merge type by checking if we're ahead
							try {
								const mergeBase = (
									await git.raw([
										"merge-base",
										sourceBranch,
										input.targetBranch,
									])
								).trim();
								const targetHead = (
									await git.revparse(["HEAD"])
								).trim();

								if (mergeBase === targetHead) {
									mergeType = "already-up-to-date";
								} else {
									// Check if it was a fast-forward
									const ancestorCheck = await git
										.raw([
											"merge-base",
											"--is-ancestor",
											sourceBranch,
											"HEAD",
										])
										.catch(() => "");
									mergeType =
										ancestorCheck === ""
											? "fast-forward"
											: "merge-commit";
								}
							} catch {
								// If we can't determine type, assume merge commit
								mergeType = "merge-commit";
							}
						} catch (error) {
							const message =
								error instanceof Error
									? error.message
									: String(error);

							// Check for worktree checkout error (shouldn't happen since we checked above, but just in case)
							if (message.includes("already checked out")) {
								throw new Error(
									`Cannot merge into '${input.targetBranch}': this branch is checked out in another worktree. ` +
									`Please merge from the worktree where '${input.targetBranch}' is checked out.`
								);
							}

							// Check for conflicts
							if (
								message.includes("CONFLICT") ||
								message.includes("merge failed") ||
								message.includes("could not apply")
							) {
								// Abort the merge
								await git.merge(["--abort"]).catch(() => {});
								throw new Error(
									`Merge failed due to conflicts. Operation aborted. Resolve conflicts manually on branch '${input.targetBranch}'.`
								);
							}

							// Check for fast-forward only failure
							if (
								input.fastForwardOnly &&
								message.includes("fatal: Not possible to fast-forward")
							) {
								throw new Error(
									"Cannot fast-forward: target branch has diverged. Try without fast-forward only option."
								);
							}

							throw error;
						} finally {
							// CRITICAL: Always switch back to original branch
							await git.checkout(sourceBranch).catch(() => {});
						}

						return { success: true, mergeType };
					});
				}
			),

		// Abort an ongoing rebase
		abortRebase: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				return withGitLock(input.worktreePath, async () => {
					const git = createGit(input.worktreePath);
					await git.rebase(["--abort"]);
					return { success: true };
				});
			}),

		// Abort an ongoing merge
		abortMerge: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				return withGitLock(input.worktreePath, async () => {
					const git = createGit(input.worktreePath);
					await git.merge(["--abort"]);
					return { success: true };
				});
			}),

		// Get repository state (rebase/merge in progress, conflicts)
		getRepositoryState: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.query(async ({ input }) => {
				assertRegisteredWorktree(input.worktreePath);
				return getRepositoryState(input.worktreePath);
			}),

		createPR: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.mutation(
				async ({ input }): Promise<{ success: boolean; url: string }> => {
					assertRegisteredWorktree(input.worktreePath);

					return withGitLock(input.worktreePath, async () => {
						const git = createGitForNetwork(input.worktreePath);
						const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
						const hasUpstream = await hasUpstreamBranch(git);

						// Ensure branch is pushed first
						if (!hasUpstream) {
							await withLockRetry(input.worktreePath, () =>
								git.push(["--set-upstream", "origin", branch])
							);
						} else {
							// Push any unpushed commits
							await withLockRetry(input.worktreePath, () => git.push());
						}

						// Get the remote URL to construct the GitHub compare URL
						const remoteUrl = (await git.remote(["get-url", "origin"])) || "";
						const repoMatch = remoteUrl
							.trim()
							.match(/github\.com[:/](.+?)(?:\.git)?$/);

						if (!repoMatch) {
							throw new Error("Could not determine GitHub repository URL");
						}

						const repo = repoMatch[1].replace(/\.git$/, "");
						const url = `https://github.com/${repo}/compare/${branch}?expand=1`;

						await shell.openExternal(url);
						await git.fetch();

						return { success: true, url };
					});
				},
			),

		getGitHubStatus: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.query(async ({ input }) => {
				assertRegisteredWorktree(input.worktreePath);
				return await fetchGitHubPRStatus(input.worktreePath);
			}),
	});
};
