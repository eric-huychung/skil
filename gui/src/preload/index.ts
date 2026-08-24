import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type ContextKitBridge } from '../shared/ipc.js';

const bridge: ContextKitBridge = {
  listCollections: (ide) => ipcRenderer.invoke(IPC_CHANNELS.listCollections, ide),
  createCollection: (name, skillIds, ide) =>
    ipcRenderer.invoke(IPC_CHANNELS.createCollection, name, skillIds, ide),
  removeSkillFromCollection: (name, skillId, ide) =>
    ipcRenderer.invoke(IPC_CHANNELS.removeSkillFromCollection, name, skillId, ide),
  exportCommand: (name, targetIDE, opts) => ipcRenderer.invoke(IPC_CHANNELS.exportCommand, name, targetIDE, opts),
  exportAll: (targetIDE, opts) => ipcRenderer.invoke(IPC_CHANNELS.exportAll, targetIDE, opts),
  copyTo: (name, fromIde, toIde, opts) => ipcRenderer.invoke(IPC_CHANNELS.copyTo, name, fromIde, toIde, opts),
  copyAll: (fromIde, toIde, opts) => ipcRenderer.invoke(IPC_CHANNELS.copyAll, fromIde, toIde, opts),
  searchSkills: (query) => ipcRenderer.invoke(IPC_CHANNELS.searchSkills, query),
  browseSkills: (view) => ipcRenderer.invoke(IPC_CHANNELS.browseSkills, view),
  listInbox: () => ipcRenderer.invoke(IPC_CHANNELS.listInbox),
  listSkills: () => ipcRenderer.invoke(IPC_CHANNELS.listSkills),
  addToInbox: (skillId) => ipcRenderer.invoke(IPC_CHANNELS.addToInbox, skillId),
  addSkill: (name, skillId, ide) => ipcRenderer.invoke(IPC_CHANNELS.addSkill, name, skillId, ide),
  deleteCollection: (name, ide) => ipcRenderer.invoke(IPC_CHANNELS.deleteCollection, name, ide),
  pickProjectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.pickProjectFolder),
  pickDestinationFolder: () => ipcRenderer.invoke(IPC_CHANNELS.pickDestinationFolder),
  getProjectRoot: () => ipcRenderer.invoke(IPC_CHANNELS.getProjectRoot),
  scan: () => ipcRenderer.invoke(IPC_CHANNELS.scan),
  install: (skillId, targetIDE, opts) => ipcRenderer.invoke(IPC_CHANNELS.install, skillId, targetIDE, opts),
};

contextBridge.exposeInMainWorld('contextkit', bridge);
