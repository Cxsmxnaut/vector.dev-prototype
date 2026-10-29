const {app,BrowserWindow,shell,Menu,Notification,dialog}=require('electron');
const path=require('node:path');
const {notificationSpec}=require('./notification-policy.cjs');
let backend,window,closing=false,quitting=false,hasOpened=false;
app.setName('vector.dev');
app.setPath('userData',process.env.VECTOR_USER_DATA||path.join(app.getPath('appData'),'vector.dev'));
const locked=app.requestSingleInstanceLock();
if(!locked)app.quit();
else {
  app.on('second-instance',()=>{window?.show();window?.focus();});
  app.whenReady().then(async()=>{
    const {createApp}=await import('../server/main.mjs');backend=await createApp({port:0,runtime:path.join(app.getPath('userData'),'runtime'),clientDir:process.env.VECTOR_CLIENT_DIR||undefined});
    const openWindow=()=>{
      window=new BrowserWindow({width:1480,height:950,minWidth:820,minHeight:600,title:'vector.dev',backgroundColor:'#111313',titleBarStyle:'hiddenInset',trafficLightPosition:{x:18,y:20},webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
      window.webContents.setWindowOpenHandler(({url})=>{if(/^https?:/.test(url))shell.openExternal(url);return{action:'deny'};});
      window.webContents.on('will-navigate',(e,url)=>{if(new URL(url).origin!==backend.origin){e.preventDefault();if(/^https?:/.test(url))shell.openExternal(url);}});
      window.on('close',event=>{if(process.platform==='darwin'&&!quitting){event.preventDefault();window.hide();}});
      window.webContents.on('will-prevent-unload',event=>{const choice=dialog.showMessageBoxSync(window,{type:'warning',buttons:['Keep open','Quit without waiting'],defaultId:0,cancelId:0,message:'Local work is still in progress.',detail:'A task, Git operation, or draft save has not finished. Quitting stops the local agent backend.'});if(choice===1)event.preventDefault();else quitting=false;});
      window.loadURL(hasOpened?backend.origin:backend.url);hasOpened=true;window.on('closed',()=>{window=null;});
    };
    Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'vector.dev',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},{role:'editMenu'},{role:'viewMenu'},{role:'windowMenu'}]));
    const notified=new Set();
    backend.rpc.on('event',async event=>{
      const isTest=event.method==='vector/notificationTest',completed=event.method==='turn/completed',needsInput=event.id!==undefined&&event.method;
      if(!isTest&&!completed&&!needsInput)return;
      try{
        const settings=(await backend.store.read()).settings;const preview=notificationSpec(event,settings,{focused:window?.isFocused()});if(!preview)return;
        const key=preview.key;if(key&&notified.has(key))return;
        if(!Notification.isSupported()){if(isTest)backend.rpc.emit('event',{method:'vector/syncError',params:{message:'Native notifications are unavailable on this system.'}});return;}
        const threadId=preview.threadId;let threadName;
        if(settings.notificationPreview&&threadId){try{const r=await backend.rpc.call('thread/read',{threadId,includeTurns:false});threadName=r.thread.name;}catch{}}
        const spec=notificationSpec(event,settings,{focused:false,threadName});
        const notification=new Notification({title:spec.title,body:spec.body,silent:false});notification.on('click',()=>{window?.show();window?.focus();if(threadId)backend.rpc.emit('event',{method:'vector/openThread',params:{threadId}});});notification.show();if(key){notified.add(key);if(notified.size>500)notified.delete(notified.values().next().value);}
      }catch{/* Notification failure must not interrupt a Codex turn. */}
    });
    openWindow();app.on('activate',()=>{if(!window)openWindow();else{window.show();window.focus();}});
  }).catch(e=>{require('electron').dialog.showErrorBox('vector.dev could not start',e.message);app.quit();});
  app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
  app.on('before-quit',event=>{if(closing)return;event.preventDefault();quitting=true;const finish=()=>{closing=true;void Promise.resolve(backend?.close()).catch(()=>{}).finally(()=>app.quit());};if(window&&!window.isDestroyed()){window.once('closed',finish);window.close();}else finish();});
}
