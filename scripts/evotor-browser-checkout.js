/* Durable browser checkout for the deployed cashier. No payment success is inferred. */
(function (scope) {
  'use strict';
  const storageKey='lemuria.evotor.checkout.v1';
  let active=null, panel=null;
  function read(){const raw=localStorage.getItem(storageKey);return raw?JSON.parse(raw):null;}
  function save(value){localStorage.setItem(storageKey,JSON.stringify(value));}
  function show(message){
    if(!panel){
      panel=document.createElement('div');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
      Object.assign(panel.style,{position:'fixed',inset:'0',zIndex:'2147483647',background:'rgba(255,255,255,.98)',display:'flex',alignItems:'center',justifyContent:'center',padding:'32px',fontSize:'22px',textAlign:'center'});
      document.body.appendChild(panel);
    }
    panel.textContent=message;
  }
  function hide(){panel?.remove();panel=null;}
  async function request(path,body,key){
    const response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const result=await response.json();
    if(!response.ok||!result.ok){const error=new Error(result.error?.message||'Ошибка связи с кассой');error.status=response.status;error.code=result.error?.code;throw error;}
    return result.data;
  }
  async function settle(journal){
    // Persist before POST; a lost response is recovered with the same immutable request.
    for(;;){
      try{
        if(!journal.number){
          const order=await request('/api/cashier/sales',journal.body,journal.key);
          journal.number=order.number;save(journal);
        }
        const order=await request('/api/cashier/sales/status?number='+encodeURIComponent(journal.number));
        if(order.status==='PAID'&&order.evotorCheckout?.state==='FISCALIZED'){
          localStorage.removeItem(storageKey);hide();return order;
        }
        if(order.status==='CANCELLED'&&order.evotorCheckout?.state==='DECLINED'){
          localStorage.removeItem(storageKey);hide();throw Object.assign(new Error('Оплата отклонена кассой. Заказ не оплачен.'),{declined:true});
        }
        show(order.evotorCheckout?.state==='CLAIMED'?'Эвотор обрабатывает оплату. Если результат неизвестен, требуется сверка на кассе. Не проводите оплату повторно.':'Заказ передан Эвотору. Ожидаем оплату и фискальный чек.');
      }catch(error){
        if(error.declined)throw error;
        // Validation rejection before a queue exists is safe to correct. A lost response is not.
        if(!journal.number&&([400,403,422].includes(error.status)||error.code==='PRICE_CHANGED')){
          localStorage.removeItem(storageKey);hide();throw error;
        }
        show(error.status===401?'Сессия истекла. Войдите в CRM в другой вкладке и вернитесь сюда. Задание сохранено.':'Связь или подтверждение пока отсутствуют. Задание сохранено; повторное списание не запускается.');
      }
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
  }
  function run(journal){
    if(active)return active;
    show('Передаём заказ Эвотору…');
    if(!scope.navigator?.locks){hide();return Promise.reject(new Error('Для безопасной оплаты нужен браузер с поддержкой Web Locks'));}
    active=scope.navigator.locks.request(storageKey,{ifAvailable:true},lock=>{
      if(!lock)throw new Error('Оплата уже открыта в другой вкладке. Вернитесь в неё.');
      const existing=read();if(existing&&existing.key!==journal.key)journal=existing;
      save(journal);return settle(journal);
    }).catch(error=>{hide();throw error;}).finally(()=>{active=null;});return active;
  }
  scope.LemuriaEvotor={async pay(body,total,shiftId){
    const pending=read();if(pending)return run(pending);
    if(body.paymentMethod==='CASH'){
      const raw=scope.prompt('Получено наличными, ₽. Сумма заказа: '+(total/100).toFixed(2),(total/100).toFixed(2));
      if(raw===null)throw new Error('Оплата отменена до отправки на кассу');
      if(!/^\d+(?:[.,]\d{1,2})?$/.test(raw.trim()))throw new Error('Укажите сумму с точностью до копейки');
      body={...body,cashReceived:Math.round(Number(raw.trim().replace(',','.'))*100)};
      if(!Number.isSafeInteger(body.cashReceived)||body.cashReceived<total||body.cashReceived>2147483647)throw new Error('Полученная сумма меньше стоимости заказа или превышает допустимую');
    }
    const journal={version:1,key:crypto.randomUUID(),shiftId,body};return run(journal);
  }};
  if(typeof document!=='undefined')setTimeout(()=>{
    let pending;try{pending=read();}catch{show('Не удалось прочитать сохранённую оплату. Нужна сверка с кассой.');return;}
    if(pending)run(pending).then(()=>scope.location.reload(),error=>scope.alert(error.message));
  },0);
})(globalThis);
