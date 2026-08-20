import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type ContextKitBridge } from '../shared/ipc.js';

const bridge: ContextKitBridge = {
  listCollections: () => ipcRenderer.invoke(IPC_CHANNELS.listCollections),
  getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.getStatus),
  activateCollection: (name) => ipcRenderer.invoke(IPC_CHANNELS.activateCollection, name),
  deactivateCollection: () => ipcRenderer.invoke(IPC_CHANNELS.deactivateCollection),
  createCollection: (name, skillIds) => ipcRenderer.invoke(IPC_CHANNELS.createCollection, name, skillIds),
  searchSkills: (query) => ipcRenderer.invoke(IPC_CHANNELS.searchSkills, query),
  installSkill: (skillId) => ipcRenderer.invoke(IPC_CHANNELS.installSkill, skillId),
};

contextBridge.exposeInMainWorld('contextkit', bridge);
