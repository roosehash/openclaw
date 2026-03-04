import path from "node:path";
import { resolveUserPath } from "../utils.js";

export interface BackupOptions {
  count?: number;
  /** Absolute path to backup directory. Supports ~ expansion. Default: same directory as config file. */
  dir?: string;
}

export interface BackupRotationFs {
  unlink: (path: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  chmod?: (path: string, mode: number) => Promise<void>;
  readdir?: (path: string) => Promise<string[]>;
}

export interface BackupMaintenanceFs extends BackupRotationFs {
  copyFile: (from: string, to: string) => Promise<void>;
  mkdir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
}

/**
 * Resolves the backup base path, either in the same directory as the config file
 * or in a custom directory if specified in options.
 *
 * When a custom dir is used, the backup filename includes the config file's basename
 * to avoid collisions when multiple configs share the same backup directory.
 * The dir is resolved via resolveUserPath (supports ~) and then made absolute.
 */
export function resolveBackupBase(configPath: string, options?: BackupOptions): string {
  if (options?.dir) {
    const resolvedDir = path.resolve(resolveUserPath(options.dir));
    const basename = path.basename(configPath);
    return path.join(resolvedDir, `${basename}.bak`);
  }
  return `${configPath}.bak`;
}

export async function rotateConfigBackups(
  configPath: string,
  ioFs: BackupRotationFs,
  options?: BackupOptions,
): Promise<void> {
  const count = options?.count ?? 5;
  if (count <= 1) {
    return;
  }
  const backupBase = resolveBackupBase(configPath, options);
  const maxIndex = count - 1;
  await ioFs.unlink(`${backupBase}.${maxIndex}`).catch(() => {
    // best-effort
  });
  for (let index = maxIndex - 1; index >= 1; index -= 1) {
    await ioFs.rename(`${backupBase}.${index}`, `${backupBase}.${index + 1}`).catch(() => {
      // best-effort
    });
  }
  await ioFs.rename(backupBase, `${backupBase}.1`).catch(() => {
    // best-effort
  });
}

/**
 * Harden file permissions on all .bak files in the rotation ring.
 * copyFile does not guarantee permission preservation on all platforms
 * (e.g. Windows, some NFS mounts), so we explicitly chmod each backup
 * to owner-only (0o600) to match the main config file.
 */
export async function hardenBackupPermissions(
  configPath: string,
  ioFs: BackupRotationFs,
  options?: BackupOptions,
): Promise<void> {
  if (!ioFs.chmod) {
    return;
  }
  const count = options?.count ?? 5;
  const backupBase = resolveBackupBase(configPath, options);
  // Harden the primary .bak
  await ioFs.chmod(backupBase, 0o600).catch(() => {
    // best-effort
  });
  // Harden numbered backups
  for (let i = 1; i < count; i++) {
    await ioFs.chmod(`${backupBase}.${i}`, 0o600).catch(() => {
      // best-effort
    });
  }
}

/**
 * Remove orphan .bak files that fall outside the managed rotation ring.
 * These can accumulate from interrupted writes, manual copies, or PID-stamped
 * backups (e.g. openclaw.json.bak.1772352289, openclaw.json.bak.before-marketing).
 *
 * Only files matching `<configBasename>.bak.*` are considered; the primary
 * `.bak` and numbered `.bak.1` through `.bak.{N-1}` are preserved.
 */
export async function cleanOrphanBackups(
  configPath: string,
  ioFs: BackupRotationFs,
  options?: BackupOptions,
): Promise<void> {
  if (!ioFs.readdir) {
    return;
  }
  const count = options?.count ?? 5;
  const backupBase = resolveBackupBase(configPath, options);
  const dir = path.dirname(backupBase);
  const base = path.basename(backupBase);
  const bakPrefix = `${base}.`;

  // Build the set of valid numbered suffixes: "1", "2", ..., "{N-1}"
  const validSuffixes = new Set<string>();
  for (let i = 1; i < count; i++) {
    validSuffixes.add(String(i));
  }

  let entries: string[];
  try {
    entries = await ioFs.readdir(dir);
  } catch {
    return; // best-effort
  }

  for (const entry of entries) {
    if (!entry.startsWith(bakPrefix)) {
      continue;
    }
    const suffix = entry.slice(bakPrefix.length);
    if (validSuffixes.has(suffix)) {
      continue;
    }
    // This is an orphan — remove it
    await ioFs.unlink(path.join(dir, entry)).catch(() => {
      // best-effort
    });
  }
}

/**
 * Run the full backup maintenance cycle around config writes.
 * Order matters: ensure backup dir exists -> rotate ring -> create new .bak -> harden modes -> prune orphan .bak.* files.
 */
export async function maintainConfigBackups(
  configPath: string,
  ioFs: BackupMaintenanceFs,
  options?: BackupOptions,
): Promise<void> {
  // Ensure backup directory exists if custom dir is specified
  if (options?.dir && ioFs.mkdir) {
    const resolvedDir = path.resolve(resolveUserPath(options.dir));
    await ioFs.mkdir(resolvedDir, { recursive: true }).catch(() => {
      // best-effort
    });
  }

  const backupBase = resolveBackupBase(configPath, options);
  await rotateConfigBackups(configPath, ioFs, options);
  await ioFs.copyFile(configPath, backupBase).catch(() => {
    // best-effort
  });
  await hardenBackupPermissions(configPath, ioFs, options);
  await cleanOrphanBackups(configPath, ioFs, options);
}
