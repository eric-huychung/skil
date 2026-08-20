import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type ContextKitBridge } from '../shared/ipc.js';

const bridge: ContextKitBridge = {
  listCollections: () => ipcRenderer.invoke(IPC_CHANNELS.listCollections),
};

contextBridge.exposeInMainWorld('contextkit', bridge);
