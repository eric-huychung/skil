import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type ContextKitBridge } from '../shared/ipc.js';

const bridge: ContextKitBridge = {
  listCollections: () => ipcRenderer.invoke(IPC_CHANNELS.listCollections),
  createCollection: (name, skillIds) => ipcRenderer.invoke(IPC_CHANNELS.createCollection, name, skillIds),
  removeSkillFromCollection: (name, skillId) =>
    ipcRenderer.invoke(IPC_CHANNELS.removeSkillFromCollection, name, skillId),
  exportCollections: (names, targetIDE) => ipcRenderer.invoke(IPC_CHANNELS.exportCollections, names, targetIDE),
  searchSkills: (query) => ipcRenderer.invoke(IPC_CHANNELS.searchSkills, query),
  browseSkills: (view) => ipcRenderer.invoke(IPC_CHANNELS.browseSkills, view),
  listInbox: () => ipcRenderer.invoke(IPC_CHANNELS.listInbox),
  addToInbox: (skillId) => ipcRenderer.invoke(IPC_CHANNELS.addToInbox, skillId),
  addSkill: (name, skillId) => ipcRenderer.invoke(IPC_CHANNELS.addSkill, name, skillId),
  deleteCollection: (name) => ipcRenderer.invoke(IPC_CHANNELS.deleteCollection, name),
  pickProjectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.pickProjectFolder),
  getProjectRoot: () => ipcRenderer.invoke(IPC_CHANNELS.getProjectRoot),
  scan: () => ipcRenderer.invoke(IPC_CHANNELS.scan),
  install: (skillId, targetIDE) => ipcRenderer.invoke(IPC_CHANNELS.install, skillId, targetIDE),
};

contextBridge.exposeInMainWorld('contextkit', bridge);
