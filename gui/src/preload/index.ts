import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type ContextKitBridge } from '../shared/ipc.js';

const bridge: ContextKitBridge = {
  listCollections: () => ipcRenderer.invoke(IPC_CHANNELS.listCollections),
  createCollection: (name, skillIds) => ipcRenderer.invoke(IPC_CHANNELS.createCollection, name, skillIds),
  addSkillToCollection: (name, skillId) => ipcRenderer.invoke(IPC_CHANNELS.addSkillToCollection, name, skillId),
  removeSkillFromCollection: (name, skillId) =>
    ipcRenderer.invoke(IPC_CHANNELS.removeSkillFromCollection, name, skillId),
  exportCollections: (names, targetIDE) => ipcRenderer.invoke(IPC_CHANNELS.exportCollections, names, targetIDE),
  searchSkills: (query) => ipcRenderer.invoke(IPC_CHANNELS.searchSkills, query),
  browseSkills: (view) => ipcRenderer.invoke(IPC_CHANNELS.browseSkills, view),
  installSkill: (skillId) => ipcRenderer.invoke(IPC_CHANNELS.installSkill, skillId),
};

contextBridge.exposeInMainWorld('contextkit', bridge);
