import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type SkilBridge, type ScanResult } from '../shared/ipc.js';

const bridge: SkilBridge = {
  listCollections: (ide) => ipcRenderer.invoke(IPC_CHANNELS.listCollections, ide),
  createCollection: (name, skillIds, ide) =>
    ipcRenderer.invoke(IPC_CHANNELS.createCollection, name, skillIds, ide),
  removeSkillFromCollection: (name, skillId, ide) =>
    ipcRenderer.invoke(IPC_CHANNELS.removeSkillFromCollection, name, skillId, ide),
  exportAll: (targetIDE, opts) => ipcRenderer.invoke(IPC_CHANNELS.exportAll, targetIDE, opts),
  importFrom: (sourceRoot, ide, opts) => ipcRenderer.invoke(IPC_CHANNELS.importFrom, sourceRoot, ide, opts),
  browseSkills: (view) => ipcRenderer.invoke(IPC_CHANNELS.browseSkills, view),
  listInbox: () => ipcRenderer.invoke(IPC_CHANNELS.listInbox),
  listSkills: () => ipcRenderer.invoke(IPC_CHANNELS.listSkills),
  addToInbox: (skillId) => ipcRenderer.invoke(IPC_CHANNELS.addToInbox, skillId),
  addSkill: (name, skillId, ide) => ipcRenderer.invoke(IPC_CHANNELS.addSkill, name, skillId, ide),
  deleteCollection: (name, ide) => ipcRenderer.invoke(IPC_CHANNELS.deleteCollection, name, ide),
  pickProjectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.pickProjectFolder),
  pickDestinationFolder: () => ipcRenderer.invoke(IPC_CHANNELS.pickDestinationFolder),
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
  marketSearch: (query) => ipcRenderer.invoke(IPC_CHANNELS.marketSearch, query),
  marketPreview: (id) => ipcRenderer.invoke(IPC_CHANNELS.marketPreview, id),
  readSkillMd: (skillId) => ipcRenderer.invoke(IPC_CHANNELS.readSkillMd, skillId),
  originChecks: () => ipcRenderer.invoke(IPC_CHANNELS.originChecks),
  updateFromMarket: (skillId, opts) => ipcRenderer.invoke(IPC_CHANNELS.updateFromMarket, skillId, opts),
  listRules: () => ipcRenderer.invoke(IPC_CHANNELS.listRules),
  readRule: (id) => ipcRenderer.invoke(IPC_CHANNELS.readRule, id),
  setAlwaysApply: (id, alwaysApply) => ipcRenderer.invoke(IPC_CHANNELS.setAlwaysApply, id, alwaysApply),
  exportRules: (targetIDE, opts) => ipcRenderer.invoke(IPC_CHANNELS.exportRules, targetIDE, opts),
};

contextBridge.exposeInMainWorld('skil', bridge);
