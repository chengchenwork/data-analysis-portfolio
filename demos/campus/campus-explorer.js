((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CampusExplorer = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';
  const palette = ['#aac5e0', '#5796cc', '#216baa', '#114779', '#47276b'];
  const colour = (value, lens='average') => value == null ? '#e1e4e8' : palette[lens==='average' ? (value<.1?0:value<.25?1:value<.5?2:value<=1?3:4) : (value<.25?0:value<.5?1:value<.75?2:value<=1?3:4)];
  const ratio = (n,d) => d > 0 ? n/d : null;
  const fmt = (x,d=0) => x == null ? '—' : Number(x).toLocaleString('en-AU',{maximumFractionDigits:d});
  const pct = x => x == null ? '—' : `${(x*100).toFixed(1)}%`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sum = (rows,key) => rows.reduce((n,r)=>n+Number(r[key]||0),0);

  function pairedComparison(rows,current,previous,completeWeeks) {
    const allowed=new Set(completeWeeks), cells=new Map();
    for(const r of rows) {
      if(!allowed.has(r.week)||!r.observations||![current,previous].includes(r.semester))continue;
      const key=`${r.room}|${r.week}`,c=cells.get(key)||{room:r.room,current:[0,0],previous:[0,0]};
      const side=r.semester===current?'current':'previous';c[side][0]+=r.occupancySum;c[side][1]+=r.observations;cells.set(key,c);
    }
    const pairs=[...cells.values()].filter(c=>c.current[1]&&c.previous[1]);
    const a=ratio(pairs.reduce((n,c)=>n+c.current[0]/c.current[1],0),pairs.length);
    const b=ratio(pairs.reduce((n,c)=>n+c.previous[0]/c.previous[1],0),pairs.length);
    return {current:a,previous:b,delta:a==null?null:a-b,cells:pairs.length,rooms:new Set(pairs.map(c=>c.room)).size,
      currentHours:pairs.reduce((n,c)=>n+c.current[1],0),previousHours:pairs.reduce((n,c)=>n+c.previous[1],0)};
  }

  let cfg, data, map, rows, state, selected='all', metric='average', query='', zoom=1, cacheKey='', cache;
  const $=selector=>document.querySelector(selector);
  const buildingId = r => `${r.campus};${r.buildingCode}`;
  let groups, groupForBuilding;
  let layerMode='markers',heatCache=null,footprints=[],footprintIds=new Set(),estimatedIds=new Set();
  let drag=null,suppressClickUntil=0,detailReady=false,detailRequested=false,panLeft=0,panTop=0;

  function mount(options) {
    cfg=options;data=window.CAMPUS_CONTEXT;map=window.CAMPUS_MAP;
    if(!data||!map)return;
    const geometry=window.CAMPUS_FOOTPRINTS;
    footprints=geometry?.meta.width===map.meta.width&&geometry?.meta.height===map.meta.height?geometry.features:[];
    footprintIds=new Set(footprints.map(f=>f.id));
    estimatedIds=new Set(footprints.filter(f=>f.method==='estimated-partition').map(f=>f.id));
    rows=window.TeacherMetrics.recordsToObjects(cfg.insights.roomWeeks,cfg.insights.meta.roomWeekSchema);
    groups=map.markers.map(m=>({...m,mapped:true}));
    for(const id of map.meta.unmapped) {
      const b=cfg.insights.buildings.find(b=>b.id===id);
      groups.push({id,code:b?.code||id,name:b?.name||id,buildingIds:[id],mapped:false});
    }
    groupForBuilding=new Map();groups.forEach(g=>g.buildingIds.forEach(id=>groupForBuilding.set(id,g.id)));
    $('#view-map').innerHTML=`
      <header class="view-heading"><div><p class="section-kicker">Spatial perspective</p><h2>Campus Map</h2></div><p>Choose a building to compare its room use, planned class sizes and changes across years.</p></header>
      <div class="map-intro"><div><span class="map-edition">FICTIONAL CAMPUS / DEMO</span><h3>Where are teaching spaces being used?</h3><p>An original schematic of eight fictional buildings. Colours reflect synthetic records for your selected period.</p></div><div class="map-coverage"><strong>${map.meta.mappedBuildings}<span> / ${map.meta.totalBuildings}</span></strong><p>buildings located on this map<br>Every building has three demo rooms.</p></div></div>
      <div class="campus-workspace">
        <article class="panel campus-map-panel">
          <header class="panel-header"><div><p class="panel-kicker">Building lens</p><h3 id="mapMetricTitle">Average utilisation</h3></div><label class="map-metric-label"><span class="sr-only">Map colour metric</span><select id="mapMetric"><option value="average">Average utilisation</option><option value="max">Operational peak</option><option value="planned">Planned room fill</option></select></label></header>
          <div class="map-display-bar"><div class="map-layer-control"><span>View</span><div id="mapLayer" role="group" aria-label="Map visualisation"><button type="button" data-layer="markers" aria-pressed="true">Markers</button><button type="button" data-layer="heatmap" aria-pressed="false">Heatmap</button><button type="button" data-layer="buildings" aria-pressed="false"${footprints.length?'':' disabled title="Building outlines unavailable"'}>Buildings</button></div></div><div class="basemap-control"><span>Basemap</span><div id="mapBasemap" role="group" aria-label="Basemap appearance"><button type="button" data-basemap="grey" aria-label="Grey basemap" aria-pressed="true">Grey</button><button type="button" data-basemap="colour" aria-label="Colour basemap" aria-pressed="false">Colour</button></div></div><button type="button" id="mapFocus" aria-label="Focus selected building" disabled>Focus building</button></div>
          <div class="map-stage" id="mapStage" data-basemap="grey" data-layer="markers" tabindex="0" role="region" aria-label="fictional campus map viewport" aria-describedby="mapGestureHint mapHeatNote"><svg id="campusSvg" viewBox="0 0 ${map.meta.width} ${map.meta.height}" aria-label="Interactive fictional campus building map"><defs><pattern id="footprintNoData" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#e1e4e8"/><path d="M-3,3L3,-3M0,12L12,0M9,15L15,9" stroke="#a0a7b0" stroke-width="2"/></pattern></defs><image href="assets/campus-schematic.svg" width="${map.meta.width}" height="${map.meta.height}" class="map-backdrop"/><image id="campusHeatLayer" class="campus-heat-layer" x="0" y="0" width="${map.meta.width}" height="${map.meta.height}" aria-hidden="true"/><g id="campusFootprints"></g><g id="campusPins"></g></svg></div>
          <div class="map-tools"><div class="map-selection-status"><span id="mapSelectionNote">Select a building pin or use the list.</span><small id="mapImageStatus"></small></div><div class="map-zoom-controls"><output id="mapZoomLevel" aria-label="Map zoom">100%</output><button type="button" id="mapZoomOut" aria-label="Zoom out">−</button><button type="button" id="mapZoomReset" aria-label="Reset map zoom">Fit</button><button type="button" id="mapZoomIn" aria-label="Zoom in">+</button></div></div>
          <p id="mapGestureHint" class="map-gesture-hint">Ctrl / ⌘ + scroll to zoom · Drag to pan when zoomed · Double-click a building to focus. Keyboard: + / −, arrows and Home.</p>\n          <div id="mapLegend" class="map-legend" aria-label="Map colour scale">${['0–25%','25–50%','50–75%','75–100%','>100%'].map((label,i)=>`<span><i style="background:${palette[i]}"></i>${label}</span>`).join('')}<span><i style="background:#e1e4e8"></i>No data</span></div>
          <p id="mapHeatNote" class="map-heat-note"></p>
          <p class="map-credit">Original fictional schematic · not a geographic map. Shapes, names and records are independently generated for this portfolio demonstration.</p>
        </article>
        <aside class="panel campus-sidebar" aria-label="Building explorer">
          <div class="building-search"><label for="buildingSearch">Find a building</label><input id="buildingSearch" type="search" placeholder="Name or building number" autocomplete="off"/><button type="button" id="mapClear">All buildings</button></div>
          <div id="mapBuildingList" class="map-building-list"></div>
          <div id="mapBuildingDetail" class="map-building-detail" aria-live="polite"></div>
        </aside>
      </div>
      <div class="campus-insight-grid">
        <article class="panel"><header class="panel-header"><div><p class="panel-kicker">Comparable coverage</p><h3>Has use changed in the same rooms?</h3><p id="mapComparisonScope"></p></div></header><div id="mapComparison" class="map-comparison"></div><p class="campus-footnote">Each paired room-week has equal weight. Only weeks fully elapsed in both datasets are included; sensor-hour coverage may still differ. This measures utilisation change, not student attendance or causation.</p></article>
        <article class="panel"><header class="panel-header"><div><p class="panel-kicker">Room detail</p><h3 id="mapRoomsTitle">Rooms behind the pattern</h3><p>Select a room to open its diagnostics with matching filters.</p></div></header><div id="mapRoomList" class="map-room-list"></div></article>
        <article class="panel calendar-panel"><header class="panel-header"><div><p class="panel-kicker">Beyond the semester</p><h3>Which months have demo records?</h3><p id="calendarScope"></p></div></header><div class="calendar-body"><div id="calendarMonths" class="calendar-months" aria-label="Monthly average utilisation"></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Source day type</th><th>Operational hours</th><th>Average use</th><th>Zero-count share</th></tr></thead><tbody id="calendarTypeBody"></tbody></table></div></div><p class="campus-footnote">Uses all available synthetic teaching weekdays and the illustrative closure day. Blank months have no records, not zero occupancy. Teaching-week and Adjusted/Observed controls do not apply here. Zero counts describe readings, not confirmed building closure.</p></article>
        <article class="panel course-context-panel"><header class="panel-header"><div><p class="panel-kicker">Timetable context · planned, not attendance</p><h3>What is timetabled here?</h3><p id="courseContextScope"></p></div></header><div class="table-scroll"><table class="data-table"><thead><tr><th>Subject / activity</th><th>Faculty</th><th>Scheduled hours</th><th>Avg planned size</th></tr></thead><tbody id="mapCourseBody"></tbody></table></div><p class="campus-footnote">Fictional subjects and faculties, grouped from the synthetic planned room-hours. This full-semester planning summary does not respond to week or key-date controls. It is not verified course attendance.</p></article>
      </div>`;
    $('#mapMetric').addEventListener('change',e=>{metric=e.target.value;paint();});
    $('#buildingSearch').addEventListener('input',e=>{query=e.target.value.toLowerCase();paintList();});
    $('#mapClear').addEventListener('click',()=>choose('all'));
    setupMapControls();
    $('#mapLayer').addEventListener('click',event=>{
      const button=event.target.closest('[data-layer]');
      if(!button||button.disabled||button.dataset.layer===layerMode)return;
      layerMode=button.dataset.layer;
      $('#mapStage').dataset.layer=layerMode;
      $('#mapLayer').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      paintMapLayer();paintList();paintDetail();
    });
    $('#view-map').addEventListener('click',e=>{
      const building=e.target.closest('[data-building]');if(building)choose(building.dataset.building);
      const room=e.target.closest('[data-map-room]');if(room)cfg.onRoom(Number(room.dataset.mapRoom));
    });
    $('#campusSvg').addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();choose(e.target.closest('[data-building]')?.dataset.building);}});
  }


  function setupMapControls() {
    const stage=$('#mapStage');
    $('#mapBasemap').addEventListener('click',event=>{
      const button=event.target.closest('[data-basemap]');
      if(!button)return;
      stage.dataset.basemap=button.dataset.basemap;
      $('#mapBasemap').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    });
    $('#mapZoomIn').addEventListener('click',()=>setZoom(zoom+.5));
    $('#mapZoomOut').addEventListener('click',()=>setZoom(zoom-.5));
    $('#mapZoomReset').addEventListener('click',()=>setZoom(1));
    $('#mapFocus').addEventListener('click',()=>focusBuilding(selected));
    stage.addEventListener('wheel',event=>{
      if(!event.ctrlKey&&!event.metaKey)return;
      event.preventDefault();
      const unit=event.deltaMode===1?16:event.deltaMode===2?stage.clientHeight:1;
      setZoom(zoom*Math.exp(-event.deltaY*unit*.003),{x:event.clientX,y:event.clientY});
    },{passive:false});
    stage.addEventListener('dblclick',event=>{
      if(performance.now()<suppressClickUntil)return;
      event.preventDefault();
      const id=event.target.closest('[data-building]')?.dataset.building;
      if(id){choose(id);focusBuilding(id);}
      else setZoom(zoom+.5,{x:event.clientX,y:event.clientY});
    });
    stage.addEventListener('pointerdown',event=>{
      if(zoom<=1||event.button!==0||!event.isPrimary)return;
      suppressClickUntil=0;
      drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:panLeft,top:panTop,moved:false};
    });
    stage.addEventListener('pointermove',event=>{
      if(!drag||event.pointerId!==drag.id)return;
      const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      if(!drag.moved&&Math.hypot(dx,dy)<5)return;
      if(!drag.moved){
        drag.moved=true;
        stage.setPointerCapture(event.pointerId);
        stage.classList.add('is-dragging');
      }
      event.preventDefault();
      setPan(drag.left-dx,drag.top-dy);
    });
    const endDrag=event=>{
      if(!drag||(event?.pointerId!=null&&event.pointerId!==drag.id))return;
      if(drag.moved){
        // Pointer moves can be coalesced; apply the release position as the final sample.
        if(event?.type==='pointerup')setPan(drag.left-(event.clientX-drag.x),drag.top-(event.clientY-drag.y));
        suppressClickUntil=performance.now()+250;
      }
      const id=drag.id;drag=null;
      stage.classList.remove('is-dragging');
      if(stage.hasPointerCapture(id))stage.releasePointerCapture(id);
    };
    stage.addEventListener('pointerup',endDrag);
    stage.addEventListener('pointercancel',endDrag);
    stage.addEventListener('lostpointercapture',endDrag);
    window.addEventListener('blur',()=>endDrag());
    stage.addEventListener('click',event=>{
      if(event.detail&&performance.now()<suppressClickUntil){event.preventDefault();event.stopPropagation();}
    },true);
    stage.addEventListener('keydown',event=>{
      if(event.target!==stage)return;
      const moves={ArrowLeft:[-80,0],ArrowRight:[80,0],ArrowUp:[0,-80],ArrowDown:[0,80]};
      if(moves[event.key]){
        event.preventDefault();setPan(panLeft+moves[event.key][0],panTop+moves[event.key][1]);
      }else if(['+','=','-','Home','0'].includes(event.key)){
        event.preventDefault();
        setZoom(['Home','0'].includes(event.key)?1:zoom+(event.key==='-'?-.5:.5));
      }
    });
    // Preserve the relative viewport when a monitor or responsive layout changes size.
    let previousWidth=stage.clientWidth,previousHeight=stage.clientHeight;
    new ResizeObserver(()=>{
      const width=stage.clientWidth,height=stage.clientHeight;
      if(!width||!height)return; // Hidden views must not erase their saved viewport.
      if(previousWidth&&previousHeight)setPan(panLeft*width/previousWidth,panTop*height/previousHeight);
      previousWidth=width;previousHeight=height;
    }).observe(stage);
    setZoom(1);
  }

  function setZoom(value,anchor) {
    const stage=$('#mapStage'),svg=$('#campusSvg'),box=stage.getBoundingClientRect();
    const next=Math.max(1,Math.min(3,value));
    const x=anchor?Math.max(0,Math.min(stage.clientWidth,anchor.x-box.left)):stage.clientWidth/2;
    const y=anchor?Math.max(0,Math.min(stage.clientHeight,anchor.y-box.top)):stage.clientHeight/2;
    const left=(panLeft+x)*next/zoom-x,top=(panTop+y)*next/zoom-y;
    zoom=next;svg.style.width=`${zoom*100}%`;svg.style.height=`${zoom*100}%`;
    setPan(zoom===1?0:left,zoom===1?0:top);
    stage.classList.toggle('is-zoomed',zoom>1);
    $('#mapZoomOut').disabled=zoom<=1;$('#mapZoomIn').disabled=zoom>=3;
    $('#mapZoomLevel').textContent=`${Math.round(zoom*100)}%`;
    updateDetailImage();
  }

  function setPan(left,top) {
    const stage=$('#mapStage'),box=stage.getBoundingClientRect();
    panLeft=Math.max(0,Math.min(box.width*(zoom-1),left));
    panTop=Math.max(0,Math.min(box.height*(zoom-1),top));
    // Direct manipulation uses one transform, independent of native SVG scrolling.
    $('#campusSvg').style.transform=`translate(${-panLeft}px,${-panTop}px)`;
  }

  function focusBuilding(id) {
    const marker=map.markers.find(m=>m.id===id);if(!marker)return;
    const stage=$('#mapStage'),svg=$('#campusSvg'),matrix=svg.getScreenCTM();
    if(!matrix)return;
    const point=new DOMPoint(marker.x,marker.y).matrixTransform(matrix),box=stage.getBoundingClientRect();
    const fitX=(point.x-box.left+panLeft)/zoom,fitY=(point.y-box.top+panTop)/zoom;
    setZoom(Math.max(2.5,zoom));
    setPan(fitX*zoom-stage.clientWidth/2,fitY*zoom-stage.clientHeight/2);
  }

  function updateDetailImage() {
    const base=map.meta.baseImage||'assets/campus-schematic.svg',detail=map.meta.detailImage;
    const element=$('.map-backdrop');
    element.setAttribute('href',zoom>=1.5&&detailReady?detail:base);
    $('#mapImageStatus').textContent=zoom>=1.5&&detailReady?'High-resolution detail':'';
    if(zoom<1.5||!detail||detailRequested)return;
    detailRequested=true;
    const image=new Image();
    image.onload=()=>{detailReady=true;updateDetailImage();};
    image.onerror=()=>{$('#mapImageStatus').textContent='Standard map retained · detail unavailable';};
    image.src=detail;
  }

  function paintPins() {
    const container=$('#campusPins');
    // Keep the same interactive nodes across selections, preserving double-clicks and focus.
    if(!container.children.length)container.innerHTML=map.markers.map(g=>`<g data-building="${esc(g.id)}" role="button" tabindex="0" class="map-pin" transform="translate(${g.x},${g.y})"><title></title><circle r="43" fill="transparent"/><circle class="pin-ring" r="31"/><circle class="pin-disc" r="25"/><text text-anchor="middle" dy="7">${esc(g.code)}</text></g>`).join('');
    map.markers.forEach((g,i)=>{
      const node=container.children[i],v=value(g),active=g.id===selected;
      node.classList.toggle('selected',active);
      node.setAttribute('aria-pressed',String(active));
      node.dataset.missing=String(v==null);
      node.dataset.footprint=String(footprintIds.has(g.id));
      node.dataset.rate=v==null?'':String(v);
      node.style.setProperty('--footprint-rate-colour',window.CampusHeatmap.colour(v)||'#e1e4e8');
      node.setAttribute('aria-label',`${g.name}: ${pct(v)}. Double-click to focus.`);
      node.querySelector('title').textContent=`${g.name} · ${pct(v)}`;
      node.querySelector('.pin-disc').setAttribute('fill',colour(v,metric));
      node.querySelector('text').setAttribute('fill',v!=null&&v>=(metric==='average'?.25:.5)?'#fff':'#142c43');
    });
    $('#mapFocus').disabled=!map.markers.some(g=>g.id===selected);
  }

  function choose(id){if(!id)return;selected=id;paint();}
  function inScope(room,selection=selected){return selection==='all'||groupForBuilding.get(buildingId(cfg.base.rooms[room]))===selection;}
  function matches(r){return state.category==='all'||cfg.base.rooms[r.room].category===state.category;}
  function value(g){const v=cache.groups.get(g.id);return !v?null:metric==='planned'?ratio(v.timetablePlanned,v.timetableCapacity):v[metric];}

  function render(nextState) {
    if(!data)return;
    state={...nextState,type:'all',location:'all'};
    const key=[state.semester,state.week,state.holidayMode,state.category].join('|');
    if(key!==cacheKey){
      cacheKey=key;
      const filtered=rows.filter(r=>r.semester===state.semester&&(state.week==='all'||r.week===state.week)&&(state.holidayMode!=='adjusted'||!r.holiday)&&matches(r));
      const grouped=new Map();
      for(const r of filtered){const id=groupForBuilding.get(buildingId(cfg.base.rooms[r.room]));const item=grouped.get(id)||{rooms:new Set(),observations:0,timetableHours:0,timetableCapacity:0,timetablePlanned:0,occupancySum:0};
        item.rooms.add(r.room);for(const k of ['observations','timetableHours','timetableCapacity','timetablePlanned','occupancySum'])item[k]+=Number(r[k]||0);grouped.set(id,item);}
      const m=window.TeacherMetrics;
      const b=m.recordsToObjects(m.filterRecords(cfg.insights.buildingHours,cfg.insights.meta.buildingHourSchema,state,{categories:cfg.insights.meta.categories}),cfg.insights.meta.buildingHourSchema);
      b.forEach(r=>r.building=groupForBuilding.get(cfg.insights.buildings[r.building].id));
      m.summariseBuildings(b).forEach(v=>Object.assign(grouped.get(v.building)||{},v));
      cache={groups:grouped,rows:filtered};
    }
    paint();
  }

  function paint(){
    if(!cache)return;
    $('#mapMetricTitle').textContent={average:'Average utilisation',max:'Operational peak',planned:'Planned room fill'}[metric];
    $('#mapSelectionNote').textContent=selected==='all'?'Select a building pin or use the list.':groups.find(g=>g.id===selected)?.name||selected;
    paintPins();
    paintMapLayer();
    paintList();paintDetail();paintComparison();paintCalendar();paintCourses();
  }

  function paintFootprints(){
    const container=$('#campusFootprints');
    // Stable SVG paths: only rate colour and selection change, never geometry or viewport.
    if(!container.children.length)container.innerHTML=footprints.map(f=>`<path class="map-footprint" data-building="${esc(f.id)}" data-method="${esc(f.method)}" d="${f.path}" fill-rule="evenodd" role="button" tabindex="0" vector-effect="non-scaling-stroke"><title></title></path>`).join('');
    footprints.forEach((f,i)=>{
      const node=container.children[i],v=value(f),active=f.id===selected;
      node.setAttribute('fill',window.CampusHeatmap.colour(v)||'url(#footprintNoData)');
      node.setAttribute('aria-pressed',String(active));
      node.setAttribute('aria-label',`${f.name}: ${pct(v)}. ${f.method==='estimated-partition'?'Estimated boundary; internal divisions are not verified.':f.method==='reviewed-main-wing'?'Fictional outline.':'Fictional schematic outline; building aggregate.'}`);
      node.classList.toggle('selected',active);
      node.dataset.missing=String(v==null);
      node.querySelector('title').textContent=`${f.name} · ${pct(v)} · ${f.method==='estimated-partition'?'Estimated boundary; not verified':f.method==='reviewed-main-wing'?'Fictional outline':'Fictional schematic outline'}`;
    });
  }

  function paintMapLayer(){
    const note=$('#mapHeatNote'),legend=$('#mapLegend');
    paintFootprints();
    if(layerMode==='markers'){
      const labels=metric==='average'?['0–10%','10–25%','25–50%','50–100%','>100%']:['0–25%','25–50%','50–75%','75–100%','>100%'];
      legend.innerHTML=labels.map((label,i)=>`<span><i style="background:${palette[i]}"></i>${label}</span>`).join('')+'<span><i style="background:#e1e4e8"></i>No data</span>';
      note.textContent='Individual building rates. Select a numbered pin for exact values; switch to Buildings for fictional building outlines or Heatmap for a smoothed overview.';
      return;
    }
    if(layerMode==='buildings'){
      const count=footprints.filter(f=>value(f)!=null).length;
      legend.innerHTML='<div class="campus-heat-scale"><div class="heat-scale-ramp" aria-hidden="true"></div><div class="heat-scale-ticks"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%+</span></div></div><span><i class="footprint-hatch-key"></i>No data</span>';
      note.innerHTML=`<strong>Fictional building outlines · ${footprints.length} buildings; ${count} have data.</strong> Colour represents the building aggregate, not variation inside a building. These shapes do not represent real buildings. Hatching = no data.`;
      return;
    }
    const key=cacheKey+'|'+metric;
    if(heatCache?.key!==key){
      const points=map.markers.map(g=>({x:g.x,y:g.y,value:value(g)}));
      const raster=window.CampusHeatmap.rasterise(points,{width:map.meta.width,height:map.meta.height});
      let url=null;
      if(raster.validPoints){
        const canvas=document.createElement('canvas');canvas.width=raster.width;canvas.height=raster.height;
        canvas.getContext('2d').putImageData(new ImageData(raster.pixels,raster.width,raster.height),0,0);
        url=canvas.toDataURL('image/png');
      }
      heatCache={key,url,count:raster.validPoints};
    }
    const image=$('#campusHeatLayer');
    if(heatCache.url){if(image.getAttribute('href')!==heatCache.url)image.setAttribute('href',heatCache.url);}
    else image.removeAttribute('href');
    legend.innerHTML='<div class="campus-heat-scale"><div class="heat-scale-ramp" aria-hidden="true"></div><div class="heat-scale-ticks"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%+</span></div></div><span class="heat-scale-key">Low → High · Fixed rate scale</span>';
    note.innerHTML=heatCache.count
      ? `<strong>Building-level smoothing · ${heatCache.count} mapped locations with data.</strong> Not indoor movement or measured values between buildings. Unsupported areas stay clear; colours saturate at 100%. Select a building for its exact rate.`
      : '<strong>No mapped building data for these filters.</strong> The heat layer is empty; missing readings are not shown as zero. Off-map buildings remain available in the list.';
  }

  function paintList(){
    const visible=groups.filter(g=>(g.name+' '+g.code).toLowerCase().includes(query)).sort((a,b)=>(value(b)??-1)-(value(a)??-1));
    $('#mapBuildingList').innerHTML=visible.length?visible.map(g=>`<button type="button" data-building="${esc(g.id)}" aria-pressed="${g.id===selected}" class="building-option${g.id===selected?' active':''}"><span class="building-swatch" style="background:${layerMode!=='markers'?(window.CampusHeatmap.colour(value(g))||'#e1e4e8'):colour(value(g),metric)}"></span><span><strong>${esc(g.name)}</strong><small>${esc(g.code)}${g.mapped?(layerMode==='buildings'?(estimatedIds.has(g.id)?' · Estimated boundary':!footprintIds.has(g.id)?' · Marker only':''):''):' · Outside fictional campus map'}</small></span><em>${pct(value(g))}</em></button>`).join(''):'<p class="campus-footnote">No buildings match your search.</p>';
  }

  function paintDetail(){
    const selectedRows=cache.rows.filter(r=>inScope(r.room));const g=groups.find(g=>g.id===selected);
    const footprint=footprints.find(f=>f.id===g?.id);
    const footprintStatus=g?(footprint?.method==='estimated-partition'
      ?'Estimated boundary · '+footprint.reviewNote
      :footprint?.method==='reviewed-main-wing'
      ?'Fictional outline; not a geographic boundary.'
      :footprint?'Fictional outline · '+(footprint.reviewNote||'Building aggregate, not indoor hotspots.')
      :g.mapped?'Marker only · No mapped outline is available for this location.'
      :'Outside the fictional campus map · No outline placed.') : '';
    const observed=sum(selectedRows,'observations'),eligible=sum(selectedRows,'registeredHours'),plannedCapacity=sum(selectedRows,'timetableCapacity');
    $('#mapBuildingDetail').innerHTML=`<p class="section-kicker">${g?esc(g.code):'ACTIVE PORTFOLIO'}</p><h3>${g?esc(g.name):'All buildings'}</h3><p>${g&&!g.mapped?'Outside the supplied fictional campus map. ':''}${fmt(new Set(selectedRows.map(r=>r.room)).size)} rooms · ${fmt(observed)} operational room-hours</p>${g?`<p id="mapSelectedRate" class="map-selected-rate"><span>${{average:'Average utilisation',max:'Operational peak',planned:'Planned room fill'}[metric]} · exact building rate</span><strong>${pct(value(g))}</strong></p>`:''}${g&&layerMode==='buildings'?`<p id="mapFootprintStatus" class="detail-note">${esc(footprintStatus)}</p>`:''}<dl><div><dt>Average room use</dt><dd>${pct(ratio(sum(selectedRows,'occupancySum'),observed))}</dd></div><div><dt>Planned room fill</dt><dd>${pct(ratio(sum(selectedRows,'timetablePlanned'),plannedCapacity))}</dd></div><div><dt>Ghost hour share</dt><dd>${pct(ratio(sum(selectedRows,'ghostHours'),eligible))}</dd></div></dl><p class="detail-note">${fmt(sum(selectedRows,'timetableHours'))} planned hours · ${fmt(eligible)} registered-size hours. Map utilisation uses concurrent building rates; room use here is the mean of individual room-hour rates.</p>`;
    const roomGroups=new Map();selectedRows.forEach(r=>{const a=roomGroups.get(r.room)||{room:r.room,observations:0,occupancySum:0};a.observations+=r.observations;a.occupancySum+=r.occupancySum;roomGroups.set(r.room,a);});
    const ranked=[...roomGroups.values()].filter(r=>r.observations).sort((a,b)=>b.occupancySum/b.observations-a.occupancySum/a.observations);
    $('#mapRoomsTitle').textContent=g?`Rooms in ${g.code}`:'Rooms behind the pattern';
    $('#mapRoomList').innerHTML=ranked.length?ranked.map(r=>`<button type="button" class="map-room" data-map-room="${r.room}"><span><strong>${esc(cfg.base.rooms[r.room].displayName)}</strong><small>${esc(cfg.base.rooms[r.room].category)} · ${fmt(r.observations)} hours</small></span><em>${pct(ratio(r.occupancySum,r.observations))}<span aria-hidden="true"> ↗</span></em></button>`).join(''):'<p class="campus-footnote">No operational room observations for this selection.</p>';
  }

  function paintComparison(){
    const periods=data.meta.periods,current=periods[state.semester];
    const prior=periods.map((p,i)=>({...p,index:i})).filter(p=>p.label.startsWith(current.label.slice(0,2))&&p.label.slice(-4)<current.label.slice(-4)).at(-1);
    $('#mapComparisonScope').textContent=prior?`${current.label} compared with ${prior.label} · ${selected==='all'?'all selected buildings':groups.find(g=>g.id===selected)?.name}`:'Select a later year to compare with the preceding available year.';
    if(!prior){$('#mapComparison').innerHTML='<p class="campus-footnote">No earlier same-semester data is available for this selection.</p>';return;}
    const complete= current.weeks.filter(w=>w.complete&&prior.weeks.some(p=>p.week===w.week&&p.complete)&&(state.week==='all'||state.week===w.week)).map(w=>w.week);
    const eligible=rows.filter(r=>matches(r)&&inScope(r.room)&&(state.holidayMode!=='adjusted'||!r.holiday));
    const c=pairedComparison(eligible,state.semester,prior.index,complete);
    if(c.delta==null){$('#mapComparison').innerHTML='<p class="campus-footnote">No paired, complete room-weeks. Partial weeks are not compared.</p>';return;}
    $('#mapComparison').innerHTML=`<div class="comparison-hero"><strong>${c.delta>=0?'+':''}${(c.delta*100).toFixed(1)}<span> pp</span></strong><p>Change in matched-room utilisation</p></div><div class="comparison-values"><span>${prior.label}<b>${pct(c.previous)}</b></span><span>${current.label}<b>${pct(c.current)}</b></span></div><p class="comparison-note">${fmt(c.rooms)} matched rooms · ${fmt(c.cells)} paired room-weeks<br>${fmt(c.previousHours)} / ${fmt(c.currentHours)} operational hours (previous / current)</p>`;
  }

  function paintCalendar(){
    const year=Number(data.meta.periods[state.semester].label.slice(-4));
    const rs=data.calendar.filter(r=>r[0]===year&&inScope(r[2])&&(state.category==='all'||cfg.base.rooms[r[2]].category===state.category));
    const months=new Map(),types=new Map();
    rs.forEach(r=>{for(const [map,key] of [[months,r[1]],[types,r[3]]]){const a=map.get(key)||{n:0,s:0,z:0};a.n+=r[5];a.s+=r[6];a.z+=r[7];map.set(key,a);}});
    $('#calendarScope').textContent=`${year} · ${selected==='all'?'all selected buildings':groups.find(g=>g.id===selected)?.name} · ${'available synthetic months'}`;
    const maximum=Math.max(.25,...[...months.values()].map(v=>v.n?v.s/v.n:0));
    $('#calendarMonths').innerHTML=Array.from({length:12},(_,i)=>{const v=months.get(i+1),n=v?.n? v.s/v.n:null,label=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i];return `<div class="month-column" title="${label}: ${pct(n)} · ${fmt(v?.n)} operational hours"><strong>${pct(n)}</strong><div><i style="height:${n==null?0:Math.max(1,n/maximum*100)}%" class="${n==null?'missing':''}"></i></div><span>${label}</span></div>`;}).join('');
    $('#calendarTypeBody').innerHTML=[...types.entries()].sort((a,b)=>b[1].n-a[1].n).map(([t,v])=>`<tr><th scope="row">${esc(t)}</th><td>${fmt(v.n)}</td><td>${pct(ratio(v.s,v.n))}</td><td>${pct(ratio(v.z,v.n))}</td></tr>`).join('')||'<tr><td colspan="4">No calendar readings match.</td></tr>';
  }

  function paintCourses(){
    const period=data.meta.periods[state.semester],snapshot=data.meta.snapshots.find(s=>s.year===Number(period.label.slice(-4)));
    $('#courseContextScope').textContent=snapshot?`${period.label} · ${snapshot.file} · full semester snapshot`:`No ${period.label.slice(-4)} timetable Excel snapshot supplied.`;
    const grouped=new Map();
    data.courses.filter(r=>r[0]===period.label&&inScope(r[1])&&(state.category==='all'||cfg.base.rooms[r[1]].category===state.category)).forEach(r=>{const key=[r[2],r[4],r[5]].join('|'),g=grouped.get(key)||{subject:r[2],title:r[3],activity:r[4],faculty:r[5],hours:0,planned:0};g.hours+=r[6];g.planned+=r[7];grouped.set(key,g);});
    const ranked=[...grouped.values()].sort((a,b)=>b.hours-a.hours);
    $('#mapCourseBody').innerHTML=ranked.length?ranked.slice(0,30).map(r=>`<tr><th scope="row"><strong>${esc(r.subject)} · ${esc(r.title)}</strong><span>${esc(r.activity)}</span></th><td>${esc(r.faculty)}</td><td>${fmt(r.hours,1)}</td><td>${fmt(ratio(r.planned,r.hours),1)}</td></tr>`).join(''):`<tr><td colspan="4">${snapshot?'No mapped single-location scheduled activities match this selection.':'Counter-based planned-size metrics remain available where supplied; a course-level snapshot is unavailable.'}</td></tr>`;
  }
  return {mount,render,pairedComparison,colour};
});
