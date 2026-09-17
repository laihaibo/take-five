import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('takeFive', {
  getState: () => ipcRenderer.invoke('timer:state'),
  onState: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on('timer:state', handler);
    return () => ipcRenderer.removeListener('timer:state', handler);
  },
  onBreakDue: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on('timer:break-due', handler);
    return () => ipcRenderer.removeListener('timer:break-due', handler);
  },
  startFocus: () => ipcRenderer.invoke('timer:start-focus'),
  pause: () => ipcRenderer.invoke('timer:pause'),
  resume: () => ipcRenderer.invoke('timer:resume'),
  reset: () => ipcRenderer.invoke('timer:reset'),
  startBreak: () => ipcRenderer.invoke('break:start'),
  postpone: (minutes) => ipcRenderer.invoke('break:postpone', minutes),
  skip: () => ipcRenderer.invoke('break:skip'),
  completeBreak: (checked) => ipcRenderer.invoke('break:complete', checked),
  toggleActivity: (id) => ipcRenderer.invoke('break:toggle-activity', id),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  getTodayStats: () => ipcRenderer.invoke('stats:today'),
  getWeekStats: () => ipcRenderer.invoke('stats:week'),
  listEvents: (limit) => ipcRenderer.invoke('stats:events', limit),
  showMainWindow: () => ipcRenderer.invoke('window:show-main'),
  closeBreakWindow: () => ipcRenderer.invoke('window:close-break'),
  setAlwaysOnTop: (on) => ipcRenderer.invoke('window:set-always-on-top', on),
  getAlwaysOnTop: () => ipcRenderer.invoke('window:get-always-on-top'),
  platform: process.platform,
});
