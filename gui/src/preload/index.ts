import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type SkilBridge, type ScanResult } from '../shared/ipc.js';

/** Preload is the only place new `window.skil` methods become callable. Renderer HMR cannot add them. */

const bridge: SkilBridge = {
  listCollections: () => ipcRenderer.invoke(IPC_CHANNELS.listCollections),
  createCollection: (name, skillIds) => ipcRenderer.invoke(IPC_CHANNELS.createCollection, name, skillIds),
  removeSkillFromCollection: (name, skillId) =>
    ipcRenderer.invoke(IPC_CHANNELS.removeSkillFromCollection, name, skillId),
  setCommandEnabled: (name, enabled) => ipcRenderer.invoke(IPC_CHANNELS.setCommandEnabled, name, enabled),
  browseSkills: (view) => ipcRenderer.invoke(IPC_CHANNELS.browseSkills, view),
  listSkills: () => ipcRenderer.invoke(IPC_CHANNELS.listSkills),
  install: (skillId) => ipcRenderer.invoke(IPC_CHANNELS.install, skillId),
  addSkill: (name, skillId) => ipcRenderer.invoke(IPC_CHANNELS.addSkill, name, skillId),
  deleteCollection: (name) => ipcRenderer.invoke(IPC_CHANNELS.deleteCollection, name),
  pickProjectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.pickProjectFolder),
  bindProjectFolder: (path) => ipcRenderer.invoke(IPC_CHANNELS.bindProjectFolder, path),
  getProjectRoot: () => ipcRenderer.invoke(IPC_CHANNELS.getProjectRoot),
  listRecentFolders: () => ipcRenderer.invoke(IPC_CHANNELS.listRecentFolders),
  removeRecentFolder: (path) => ipcRenderer.invoke(IPC_CHANNELS.removeRecentFolder, path),
  scan: () => ipcRenderer.invoke(IPC_CHANNELS.scan),
  onScan: (listener) => {
    const wrapped = (_event: unknown, result: ScanResult) => listener(result);
    ipcRenderer.on(IPC_CHANNELS.scanDidRun, wrapped);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.scanDidRun, wrapped);
    };
  },
  deleteSkill: (skillId) => ipcRenderer.invoke(IPC_CHANNELS.deleteSkill, skillId),
  usage: () => ipcRenderer.invoke(IPC_CHANNELS.usage),
  marketShelves: () => ipcRenderer.invoke(IPC_CHANNELS.marketShelves),
  marketSuggested: (role) => ipcRenderer.invoke(IPC_CHANNELS.marketSuggested, role),
  marketCreators: () => ipcRenderer.invoke(IPC_CHANNELS.marketCreators),
  marketCreator: (slug) => ipcRenderer.invoke(IPC_CHANNELS.marketCreator, slug),
  marketSearch: (query) => ipcRenderer.invoke(IPC_CHANNELS.marketSearch, query),
  marketPreview: (id) => ipcRenderer.invoke(IPC_CHANNELS.marketPreview, id),
  readSkillMd: (skillId) => ipcRenderer.invoke(IPC_CHANNELS.readSkillMd, skillId),
  originChecks: () => ipcRenderer.invoke(IPC_CHANNELS.originChecks),
  updateFromMarket: (skillId, opts) => ipcRenderer.invoke(IPC_CHANNELS.updateFromMarket, skillId, opts),
  setSkillEnabled: (skillId, enabled) => ipcRenderer.invoke(IPC_CHANNELS.setSkillEnabled, skillId, enabled),
  listRules: () => ipcRenderer.invoke(IPC_CHANNELS.listRules),
  readRule: (id) => ipcRenderer.invoke(IPC_CHANNELS.readRule, id),
  setSharedRuleEnabled: (id, enabled) => ipcRenderer.invoke(IPC_CHANNELS.setSharedRuleEnabled, id, enabled),
  auditSync: () => ipcRenderer.invoke(IPC_CHANNELS.auditSync),
  previewSync: (path) => ipcRenderer.invoke(IPC_CHANNELS.previewSync, path),
  importToCanonical: (ids) => ipcRenderer.invoke(IPC_CHANNELS.importToCanonical, ids),
  removeLeftovers: (paths) => ipcRenderer.invoke(IPC_CHANNELS.removeLeftovers, paths),
  resolveDrift: (id, action, path) => ipcRenderer.invoke(IPC_CHANNELS.resolveDrift, id, action, path),
  health: () => ipcRenderer.invoke(IPC_CHANNELS.health),
  llmStatus: () => ipcRenderer.invoke(IPC_CHANNELS.llmStatus),
  saveLlmSettings: (provider, apiKey) => ipcRenderer.invoke(IPC_CHANNELS.saveLlmSettings, provider, apiKey),
  setActiveLlmKey: (id) => ipcRenderer.invoke(IPC_CHANNELS.setActiveLlmKey, id),
  revealLlmKey: (id) => ipcRenderer.invoke(IPC_CHANNELS.revealLlmKey, id),
  removeLlmKey: (id) => ipcRenderer.invoke(IPC_CHANNELS.removeLlmKey, id),
  suggest: (shelves, role) => ipcRenderer.invoke(IPC_CHANNELS.suggest, shelves, role),
  checkAppUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.checkAppUpdate),
};

contextBridge.exposeInMainWorld('skil', bridge);
