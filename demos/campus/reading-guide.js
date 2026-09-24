/* Plain-language help only. This module never changes data, filters or metrics. */
(() => {
  'use strict';
  const topics = {
    'room-use': {
      title: 'Average room use',
      meaning: 'How full rooms were in the recorded hours. Each reading is the highest people-counter count within that hour divided by the room capacity. The headline averages these room-hour percentages.',
      formula: 'People counted ÷ room capacity; then average the valid room-hour percentages.',
      example: 'Illustrative example: 20 people in a 100-seat room gives 20% room use for that hour.',
      caution: 'This is not the percentage of enrolled students who attended, or the percentage of time a room was booked. Missing readings are not zero. Counts above 150% of capacity are kept separately for review.'
    },
    building: {
      title: 'Average building use',
      meaning: 'For each hour, add up the people and seats in rooms with valid readings in the building. Average those hourly building percentages over the selected period.',
      formula: 'Sum of people ÷ sum of seats at each building-hour; then average those rates.',
      example: 'Illustrative example: one room records 20 / 100 and another 30 / 50 in the same hour. Building use is 50 / 150 = 33.3%, not the simple average of 20% and 60%.',
      caution: 'Only monitored rooms with valid readings contribute. The set of rooms can change over time. The Average room use figure treats room-hours differently and need not equal this value.'
    },
    peak: {
      title: 'Highest hourly use',
      meaning: 'The highest valid occupancy percentage recorded within the selected period. For a building, room counts and capacities are combined at each hour before taking the highest rate.',
      formula: 'Maximum valid people ÷ capacity rate in the selection.',
      example: 'Illustrative example: hourly rates of 10%, 20% and 60% give a peak of 60%, while their average is 30%.',
      caution: 'A peak can come from a single hour. It does not mean the building or theatre was usually this busy. Values above 150% are excluded and shown in the readings-to-check table.'
    },
    under25: {
      title: 'Buildings whose peak stayed below 25%',
      meaning: 'Buildings whose highest valid hourly rate was below 25% in the active selection. This is a flag for further investigation, not a recommendation to close a building.',
      formula: 'Count buildings with maximum valid use < 25%.',
      example: 'Illustrative example: a building with a peak of 24% qualifies. A building with a 10% average but a 70% peak does not.',
      caution: 'The statement applies only to the selected dates and recorded rooms. Missing hours do not prove a building was empty, and selecting one week changes the period being assessed.'
    },
    planned: {
      title: 'Planned seats filled',
      meaning: 'Whether the planned class size fits the room capacity, before considering attendance. Below 100% means spare seats overall; above 100% means the plan exceeds room capacity.',
      formula: 'Sum of planned class sizes ÷ sum of room capacities over scheduled room-hours.',
      example: 'Illustrative example: 40 students planned for a 100-seat room gives 40% planned fill and 60 spare seats. Planning 120 students gives 120% and a 20-seat shortage.',
      caution: 'Planned students are not measured attendees. The aggregate can hide individual oversized classes. There is no universally ideal fill level: accessibility, layout and teaching requirements can justify spare seats.'
    },
    spare: {
      title: 'Spare seats in the plan',
      meaning: 'Seats left after accommodating the planned class size. A negative value means the plan asks for more seats than the room provides.',
      formula: 'Room capacity − planned class size, averaged over scheduled room-hours.',
      example: 'Illustrative example: 100 seats − 40 planned students = 60 spare seats. With 120 planned students, the value is −20.',
      caution: 'This is a planning gap, not the number of empty seats observed by the counter. An average can hide individual oversized classes.'
    },
    shortfall: {
      title: 'Fewer people than planned',
      meaning: 'The positive gap between planned class size and the people-counter reading, averaged over hours where both are usable. Hours above the planned size contribute zero shortfall.',
      formula: 'Average of max(planned size − people counted, 0).',
      example: 'Illustrative example: 40 planned students and 25 people counted gives a shortfall of 15 for that hour.',
      caution: 'It is not a verified count of absent students. The counter does not identify people or validate attendance at a particular class.'
    },
    hours: {
      title: 'What is a room-hour?',
      meaning: 'One room observed for one hour counts as one room-hour. Scheduled room-hours have planned-size data; eligible hours are the subset with the valid inputs needed for the metric.',
      formula: 'Number of rooms × number of recorded hours, counting each valid room-hour once.',
      example: 'Illustrative example: 3 rooms, each recorded for 2 hours, contribute 6 room-hours. They are not necessarily 6 separate classes.',
      caution: 'Missing hours are not filled in as zero. Longer or more frequently observed rooms contribute more room-hours. One building-hour instead combines available rooms in that building at that hour.'
    },
    overplanned: {
      title: 'Booked hours with too few seats',
      meaning: 'The number of scheduled room-hours in which planned class size exceeds physical room capacity.',
      formula: 'Count scheduled room-hours where planned size > capacity.',
      example: 'Illustrative example: a 100-seat room with 120 planned students over 2 recorded hours contributes 2 over-capacity room-hours.',
      caution: 'This counts hourly records, not distinct classes or students. It flags the plan for checking; it does not prove that actual attendance exceeded capacity.'
    },
    outliers: {
      title: 'Readings that need checking',
      meaning: 'People-counter readings above 150% of the listed room capacity. These remain visible here but are excluded from the regular occupancy, attendance and unused-seat summaries.',
      formula: 'People counted ÷ room capacity > 150%.',
      example: 'Illustrative example: 160 people recorded against 100 seats gives 160% and is flagged. Exactly 150% is not excluded by this rule.',
      caution: 'This is a data-review flag, not proof of overcrowding. Possible explanations include incorrect capacity metadata, counter problems or a genuine unusual event.'
    },
    ghost: {
      title: 'Near-empty booked hours',
      meaning: 'Scheduled room-hours with a positive registered class size where the counter records fewer than 10% of that number. The technical term used in the project is ghost room-hours.',
      formula: 'People counted ÷ registered class size < 10%, with valid counter data.',
      example: 'Illustrative example: 50 registered students and 3 people counted gives 6%, so the hour is flagged. 5 people gives exactly 10% and is not flagged.',
      caution: 'A flagged hour is not a confirmed cancelled class. Check timetable changes and sensor coverage. One multi-hour class may produce several flagged room-hours.'
    },
    attendance: {
      title: 'People counted versus registered size',
      meaning: 'How the hourly people count compares with the registered class size. The dashboard averages the actual-to-registered ratio over eligible room-hours.',
      formula: 'Mean of people counted ÷ registered class size.',
      example: 'Illustrative example: 30 people counted against 50 registered students gives a ratio of 60% for that hour.',
      caution: 'This is not verified student attendance or the probability that a student attends. Counters do not identify people. Ratios can exceed 100%; they are not capped.'
    },
    'empty-seats': {
      title: 'Unused seats over booked hours',
      meaning: 'Adds up unoccupied seats during eligible scheduled lecture-theatre hours. It highlights where large rooms may be used lightly.',
      formula: 'Sum of max(room capacity − people counted, 0) × 1 hour.',
      example: 'Illustrative example: a 100-seat theatre with 20 people in each of 2 recorded hours contributes (100 − 20) × 2 = 160 empty seat-hours.',
      caution: 'This is not measured energy use, electricity saved or a count of unique seats. It excludes unbooked hours and does not establish that a room could have been closed.'
    },
    coverage: {
      title: 'Hours with a class-type label',
      meaning: 'The share of eligible actual-versus-registered room-hours with a usable activity label, such as Lecture or Tutorial. It tells you how much data supports the class-type comparison.',
      formula: 'Eligible hours with activity labels ÷ all eligible registered-size hours.',
      example: 'Illustrative example: 60 labelled hours out of 100 eligible hours gives 60% coverage.',
      caution: 'Coverage is not attendance and not the share of all classes on campus. A comparison based on a small subset may not represent the remaining data.'
    },
    correlation: {
      title: 'Do larger planned classes have higher counts?',
      meaning: 'Pearson correlation describes how registered class size and people counts move together across eligible hourly records. It ranges from −1 to +1.',
      formula: 'Pearson correlation between registered class size and people counted.',
      example: 'Illustrative example: +0.8 indicates a strong positive linear association. It does not mean 80% of students attended. A dash means the value cannot be calculated.',
      caution: 'Correlation is not causation or a measure of attendance accuracy. Always check the eligible-hour count; repeated room-hour observations are not independent class sessions.'
    },
    calendar: {
      title: 'Include or exclude special dates',
      meaning: 'Adjusted excludes an illustrative closure day in week 7. Observed includes it. Both semesters have 12 complete synthetic teaching weeks; these are not official academic dates.',
      formula: 'Same metric, different included dates.',
      example: 'Illustrative example: if a retained teaching week includes 1 supported public holiday, Adjusted excludes readings on that date; Observed includes them.',
      caution: 'The calendar panel includes all available synthetic records and ignores teaching-week and key-date controls. Empty months have no demo records, not zero occupancy.'
    },
    comparison: {
      title: 'Comparing the same rooms and weeks',
      meaning: 'Compares matching rooms in matching, complete teaching weeks in the same semester of two available years. Each matched room-week has equal weight.',
      formula: 'Current matched-room use − previous matched-room use, in percentage points (pp).',
      example: 'Illustrative example: a change from 20% to 25% is +5 percentage points, not +5% relative growth.',
      caution: 'Incomplete weeks are excluded. Sensor-hour coverage can still differ. This describes a change in room use, not its cause or a change in student attendance.'
    }
  };
  const guides = {
    map: ['Where are rooms being used most?', 'Choose a colour metric, then select a building to see its rooms. Building selection updates this map view only.', 'Example: 20 people / 100 seats = 20% hourly use. In Planned mode, 40 planned students / 100 seats = 40% fill.', 'Colour describes the selected building metric, not people moving around the map. Grey or hatching can mean no data.', 'map-metric'],
    overview: ['Which buildings need a closer look?', 'Use Average for overall use and Max for the busiest recorded hour. The ranking follows this choice.', 'Example: a 20% average and an 80% peak can both be true for the same building.', 'Low average use does not mean a building is always empty or could be closed.', 'building'],
    temporal: ['When are spaces busiest?', 'Read across a row to compare weekdays or hours. Each cell shows the highest valid rate, not an average.', 'In Day mode: a Monday cell of 70% means the highest recorded Monday hour reached 70%.', 'A single busy hour can set the colour. It does not mean every Monday was that busy.', 'peak'],
    diagnostics: ['Does the planned class fit the room?', 'Compare planned size with room capacity. Then check the counter separately for count-to-plan gaps or unusual readings.', 'Example: 100 seats, 40 planned students, 20 people counted → 40% planned fill, but 20% room use.', 'Planning fit and recorded people counts answer different questions. Spare seats are not automatically waste.', 'planned'],
    energy: ['Which booked hours have few people?', 'Look for near-empty bookings and large numbers of unused seat-hours. Use these as leads for timetable review.', 'Example: 80 unused seats for 2 recorded hours = 160 empty seat-hours.', 'Unused seats are not measured energy savings. Counter readings do not verify individual student attendance.', 'ghost']
  };
  function element(tag, className, text) {
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!=null)node.textContent=text;
    return node;
  }
  function helpButton(key, name) {
    const button=element('button','metric-help-button','?');
    button.type='button';button.dataset.explain=key;
    button.setAttribute('aria-label','Explain '+name);
    button.setAttribute('aria-haspopup','dialog');
    button.setAttribute('aria-controls','metricHelpDialog');
    return button;
  }
  if(!document.querySelector('#view-map .view-heading'))return;
  for(const [view,copy] of Object.entries(guides)){
    const heading=document.querySelector('#view-'+view+' .view-heading');
    const oldDescription=heading.querySelector(':scope > p');
    if(oldDescription){oldDescription.classList.add('view-purpose');heading.firstElementChild.append(oldDescription);}
    const guide=element('aside','reading-guide');
    guide.setAttribute('aria-label','How to read this view');
    const top=element('div','reading-guide-top');
    top.append(element('span','reading-guide-kicker','How to read'),helpButton(copy[4],copy[0]));
    guide.append(top,element('h3','',copy[0]),element('p','',copy[1]),element('p','reading-guide-example',copy[2]),element('p','reading-guide-caution',copy[3]));
    heading.append(guide);
  }
  const cards = {
    kpiOccupancy:['room-use','People counted as a share of room capacity.'],
    mostBuilding:['building-rank','Ranking follows the Max / Average switch below.'],
    leastBuilding:['building-rank','Compare the selected rate, not just the building size.'],
    under25Value:['under25','Even the busiest valid hour stayed below one-quarter full.'],
    gapRoomCount:['hours','Only rooms with usable planning data are included.'],
    plannedFitValue:['planned','Planned students ÷ seats, before attendance is considered.'],
    overplannedValue:['overplanned','Counts hourly records, not separate classes.'],
    outlierCount:['outliers','Flagged readings, not confirmed overcrowding.'],
    ghostCount:['ghost','Fewer than 10 people counted per 100 registered.'],
    attendanceReliability:['attendance','A counter-to-registration ratio, not verified attendance.'],
    energyEmptySeats:['empty-seats','Unused seats × booked hours; not electricity saved.'],
    activityCoverageValue:['coverage','How much of the eligible data has a class-type label.']
  };
  for(const [id,[key,note]] of Object.entries(cards)){
    const card=document.getElementById(id)?.closest('.metric-card');
    if(!card)continue;
    card.querySelector(':scope > p').append(helpButton(key,(topics[key]?.title || 'building ranking')));
    card.append(element('small','metric-reading-note',note));
  }
  const headerHelp=[
    ['.timetable-panel th:nth-child(2)','hours'],['.timetable-panel th:nth-child(5)','spare'],
    ['.timetable-panel th:nth-child(6)','planned'],['.timetable-panel th:nth-child(7)','shortfall'],
    ['#view-energy .correlation-panel th:nth-child(3)','attendance'],['#view-energy .correlation-panel th:nth-child(5)','correlation'],
    ['.building-panel .panel-kicker','building'],['.calendar-panel th:nth-child(2)','hours'],
    ['.campus-insight-grid > article:first-child .panel-kicker','comparison'],['.adjustment-field legend','calendar']
  ];
  for(const [selector,key] of headerHelp)document.querySelectorAll(selector).forEach(node=>node.append(helpButton(key,topics[key].title)));
  const dialog=element('dialog','metric-help-drawer');dialog.id='metricHelpDialog';
  dialog.setAttribute('aria-labelledby','metricHelpTitle');dialog.setAttribute('aria-describedby','metricHelpMeaning');
  const header=element('header','metric-help-header');
  const caption=element('div','');caption.append(element('p','reading-guide-kicker','Metric explained'));
  const title=element('h2','');title.id='metricHelpTitle';caption.append(title);
  const close=element('button','metric-help-close','×');close.type='button';close.setAttribute('aria-label','Close explanation');
  header.append(caption,close);dialog.append(header);
  for(const [id,label] of [['Meaning','In plain English'],['Example','A simple example'],['Formula','How it is calculated'],['Caution','What it does not tell you']]){
    const section=element('section','metric-help-section');const p=element('p','');p.id='metricHelp'+id;
    section.append(element('h3','',label),p);dialog.append(section);
  }
  document.body.append(dialog);
  let opener=null;
  document.addEventListener('click',event=>{
    const trigger=event.target.closest('[data-explain]');
    if(!trigger)return;
    let key=trigger.dataset.explain;
    if(key==='map-metric')key={average:'building',max:'peak',planned:'planned'}[document.querySelector('#mapMetric').value];
    if(key==='building-rank')key=document.querySelector('#buildingMetric .active')?.dataset.metric==='max'?'peak':'building';
    const topic=topics[key];if(!topic)return;
    event.preventDefault();opener=trigger;
    title.textContent=topic.title;
    for(const field of ['Meaning','Example','Formula','Caution'])document.getElementById('metricHelp'+field).textContent=topic[field.toLowerCase()];
    dialog.showModal();close.focus({preventScroll:true});
  });
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;
    const r=dialog.getBoundingClientRect();
    if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
  });
  dialog.addEventListener('close',()=>opener?.focus({preventScroll:true}));
})();
