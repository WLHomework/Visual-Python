export type PluginRecovery<T> = {
  pluginId: string;
  previousPlugin?: T;
  previousWasActive: boolean;
  hasCurrentPlugin: () => boolean;
  register: (plugin: T) => void;
  activate: (pluginId: string) => Promise<void>;
};

export type InstalledPluginRecovery = {
  path: string;
  previousFiles?: Record<string, string>;
  install: (files: Record<string, string>) => Promise<void>;
  remove: (path: string) => Promise<void>;
};

export async function restoreInstalledPluginFiles({ path, previousFiles, install, remove }: InstalledPluginRecovery): Promise<void> {
  if (previousFiles) {
    await install(previousFiles);
    return;
  }
  await remove(path);
}

export async function restorePluginAfterFailure<T>({
  pluginId,
  previousPlugin,
  previousWasActive,
  hasCurrentPlugin,
  register,
  activate,
}: PluginRecovery<T>): Promise<boolean> {
  if (!previousPlugin || hasCurrentPlugin()) return false;
  register(previousPlugin);
  if (previousWasActive) await activate(pluginId);
  return true;
}
