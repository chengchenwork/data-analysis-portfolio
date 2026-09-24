(() => {
  "use strict";

  const base = window.CAMPUS_SPACE_DATA;
  const insights = window.CAMPUS_TEACHER_INSIGHTS;
  const keyDates = window.CAMPUS_KEY_DATES || { meta: {}, events: [] };
  const spaceTypes = window.SISFM_SPACE_TYPES || { types: {} };
  const metrics = window.TeacherMetrics;

  if (!base || !insights || !metrics) {
    document.body.innerHTML = '<main class="load-error"><h1>Dashboard data unavailable</h1><p>Rebuild the dashboard data files and refresh.</p></main>';
    return;
  }

  const schemas = Object.freeze({
    building: insights.meta.buildingHourSchema,
    theatre: insights.meta.theatreHourSchema,
    room: insights.meta.roomWeekSchema,
    activity: insights.meta.activityMomentSchema,
    outlier: insights.meta.outlierSchema,
  });
  const indexes = Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [name, metrics.schemaIndex(schema)]),
  );
  const dimensions = { rooms: base.rooms, categories: insights.meta.categories };
  const roomByCode = new Map(base.rooms.map((room, index) => [room.code, { ...room, index }]));

  const state = {
    view: "map",
    semester: insights.meta.semesters.length - 1,
    week: "all",
    category: "all",
    type: "all",
    location: "all",
    holidayMode: keyDates.meta?.adjustmentDefault || "adjusted",
    buildingMetric: "max",
    temporalMode: "building-weekday",
  };

  let resizeTimer = null;
  let motionEnabled = false;
  let lastAnimatedView = null;

  init();

  function init() {
    window.CampusExplorer?.mount({
      base, insights, onRoom: (index) => {
        const room = base.rooms[index];
        state.view = "diagnostics"; state.category = room.category; state.type = room.type; state.location = room.code;
        renderAll();
        document.querySelector("#view-diagnostics").scrollIntoView({block:"start",behavior:"instant"});
      },
    });
    initialiseControls();
    bindDialog();
    updateSourceLabels();
    initMotion();
    renderAll();
    updateScrollProgress();
    window.addEventListener("scroll", updateScrollProgress, { passive: true });
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => renderActiveView(), 140);
    });
  }

  function initialiseControls() {
    const viewButtons = [...document.querySelectorAll("#dashboardViews [role=tab]")];
    viewButtons.forEach((button, index) => {
      button.addEventListener("click", () => {
        state.view = button.dataset.view;
        renderAll();
        document.querySelector(`#view-${state.view}`)?.focus({ preventScroll: true });
      });
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const delta = event.key === "ArrowRight" ? 1 : -1;
        const next = viewButtons[(index + delta + viewButtons.length) % viewButtons.length];
        next.focus();
        next.click();
      });
    });

    const semesterSelect = document.querySelector("#semesterSelect");
    const years = [...new Set(insights.meta.semesters.map(s => s.slice(-4)))];
    years.forEach(year => {
      const group = document.createElement("optgroup"); group.label = year;
      insights.meta.semesters.forEach((semester,index) => {
        if(semester.endsWith(year)) group.appendChild(new Option(semester,String(index)));
      });
      semesterSelect.appendChild(group);
    });
    semesterSelect.addEventListener("change",event => {
      state.semester = Number(event.target.value); state.week = "all"; renderAll();
    });

    const weekFilter = document.querySelector("#weekFilter");
    insights.meta.weeks.forEach((week) => weekFilter.appendChild(new Option(`Week ${week}`, String(week))));
    weekFilter.addEventListener("change", (event) => {
      state.week = event.target.value === "all" ? "all" : Number(event.target.value);
      renderAll();
    });

    document.querySelector("#categoryFilter").addEventListener("change", (event) => {
      state.category = event.target.value;
      state.type = "all";
      state.location = "all";
      renderAll();
    });
    document.querySelector("#typeFilter").addEventListener("change", (event) => {
      state.type = event.target.value;
      state.location = "all";
      renderAll();
    });
    document.querySelector("#locationFilter").addEventListener("change", (event) => {
      state.location = event.target.value;
      renderAll();
    });
    document.querySelector("#resetFilters").addEventListener("click", () => {
      Object.assign(state, {
        semester: insights.meta.semesters.length - 1,
        week: "all",
        category: "all",
        type: "all",
        location: "all",
        holidayMode: keyDates.meta?.adjustmentDefault || "adjusted",
      });
      renderAll();
    });

    document.querySelectorAll("#holidayAdjustment button").forEach((button) => {
      button.addEventListener("click", () => {
        state.holidayMode = button.dataset.mode;
        renderAll();
      });
    });
    document.querySelectorAll("#buildingMetric button").forEach((button) => {
      button.addEventListener("click", () => {
        state.buildingMetric = button.dataset.metric;
        syncControls();
        renderOverview();
      });
    });
    document.querySelectorAll("#temporalMode button").forEach((button) => {
      button.addEventListener("click", () => {
        state.temporalMode = button.dataset.mode;
        renderTemporal();
      });
    });
  }

  function bindDialog() {
    const dialog = document.querySelector("#methodDialog");
    document.querySelector("#methodButton").addEventListener("click", () => {
      dialog.showModal();
      if (motionEnabled) {
        window.gsap.fromTo(dialog, { autoAlpha: 0, y: 16, scale: 0.98 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.38, ease: "power3.out" });
      }
    });
    document.querySelector("#closeMethod").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  function initMotion() {
    motionEnabled = Boolean(window.gsap) && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!motionEnabled) return;
    window.gsap.fromTo(
      ".teacher-hero [data-reveal]",
      { autoAlpha: 0, y: 18 },
      { autoAlpha: 1, y: 0, duration: 0.65, stagger: 0.1, ease: "power3.out", clearProps: "opacity,visibility,transform" },
    );
  }

  function renderAll() {
    syncViewNavigation();
    syncControls();
    syncFilterOptions();
    renderFilterSummary();
    renderKeyDateContext();
    renderTypeProfile();
    renderHero();
    renderPeriodCoverage();
    renderActiveView();
  }

  function renderActiveView() {
    if (state.view === "map") window.CampusExplorer?.render(state);
    if (state.view === "overview") renderOverview();
    if (state.view === "temporal") renderTemporal();
    if (state.view === "diagnostics") renderDiagnostics();
    if (state.view === "energy") renderEnergy();
    if (motionEnabled && lastAnimatedView !== state.view) {
      const view = document.querySelector(`#view-${state.view}`);
      window.gsap.fromTo(
        view.querySelectorAll(":scope > [data-reveal], :scope > div > [data-reveal]"),
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.38, stagger: 0.035, ease: "power2.out", clearProps: "opacity,transform" },
      );
      lastAnimatedView = state.view;
    }
  }

  function syncViewNavigation() {
    document.querySelectorAll("#dashboardViews [role=tab]").forEach((button) => {
      const active = button.dataset.view === state.view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll(".dashboard-view").forEach((panel) => {
      const active = panel.id === `view-${state.view}`;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
    const contextual = ["diagnostics", "energy"].includes(state.view);
    document.querySelector("#typeFilterField").hidden = !contextual;
    document.querySelector("#locationFilterField").hidden = !contextual;
  }

  function syncControls() {
    document.querySelector("#semesterSelect").value = String(state.semester);
    document.querySelectorAll("#semesterSegment button").forEach((button) => {
      const active = Number(button.dataset.semester) === state.semester;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    document.querySelector("#weekFilter").value = String(state.week);
    document.querySelectorAll("#holidayAdjustment button").forEach((button) => {
      const active = button.dataset.mode === state.holidayMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll("#buildingMetric button").forEach((button) => button.classList.toggle("active", button.dataset.metric === state.buildingMetric));
    document.querySelectorAll("#temporalMode button").forEach((button) => button.classList.toggle("active", button.dataset.mode === state.temporalMode));
  }

  function syncFilterOptions() {
    replaceOptions(
      document.querySelector("#categoryFilter"),
      [{ value: "all", label: "All space categories" }, ...insights.meta.categories.map((value) => ({ value, label: value }))],
      state.category,
    );
    const typeRooms = base.rooms.filter((room) => state.category === "all" || room.category === state.category);
    const types = [...new Set(typeRooms.map((room) => room.type))].sort((a, b) => roomTypeLabel(a).localeCompare(roomTypeLabel(b)));
    if (state.type !== "all" && !types.includes(state.type)) state.type = "all";
    replaceOptions(
      document.querySelector("#typeFilter"),
      [{ value: "all", label: "All room types" }, ...types.map((value) => ({ value, label: roomTypeLabel(value) }))],
      state.type,
    );
    const locationSelect = document.querySelector("#locationFilter");
    const locationField = document.querySelector("#locationFilterField");
    const locked = state.type === "all";
    const locations = locked ? [] : typeRooms.filter((room) => room.type === state.type).sort((a, b) => roomName(a).localeCompare(roomName(b)));
    if (state.location !== "all" && !locations.some((room) => room.code === state.location)) state.location = "all";
    replaceOptions(
      locationSelect,
      [{ value: "all", label: locked ? "Select a room type first" : `All locations (${locations.length})` }, ...locations.map((room) => ({ value: room.code, label: `${roomName(room)} · ${room.capacity} seats` }))],
      state.location,
    );
    locationSelect.disabled = locked;
    locationField.classList.toggle("is-disabled", locked);
  }

  function replaceOptions(select, options, selected) {
    const signature = options.map((option) => `${option.value}:${option.label}`).join("|");
    if (select.dataset.signature !== signature) {
      select.replaceChildren(...options.map((option) => new Option(option.label, option.value)));
      select.dataset.signature = signature;
    }
    select.value = String(selected);
  }

  function effectiveState(options = {}) {
    const allowRoomDetail = options.allowRoomDetail ?? ["diagnostics", "energy"].includes(state.view);
    return {
      ...state,
      type: allowRoomDetail ? state.type : "all",
      location: allowRoomDetail ? state.location : "all",
      ...(options.ignoreWeek ? { week: "all" } : {}),
      ...(options.ignoreCategory ? { category: "all" } : {}),
    };
  }

  function filteredRecords(records, schema, options = {}) {
    return metrics.filterRecords(records, schema, effectiveState(options), dimensions);
  }

  function objects(records, schema) {
    return metrics.recordsToObjects(records, schema);
  }

  function roomSummaries(options = {}) {
    const records = objects(filteredRecords(insights.roomWeeks, schemas.room, options), schemas.room);
    const summaries = new Map();
    records.forEach((record) => {
      const item = summaries.get(record.room) || {
        room: record.room,
        observations: 0,
        occupancySum: 0,
        operationalMax: 0,
        peakHeadcount: 0,
        peakCapacity: 0,
        peakTimestamp: "",
        plannedHours: 0,
        plannedGap: 0,
        timetableHours: 0,
        timetableCapacity: 0,
        timetablePlanned: 0,
        timetableSpare: 0,
        timetableOverCapacityHours: 0,
        registeredHours: 0,
        ghostHours: 0,
        theatreScheduledHours: 0,
        emptySeatHours: 0,
        availableSeatHours: 0,
        corrN: 0,
        corrSx: 0,
        corrSy: 0,
        corrSxx: 0,
        corrSyy: 0,
        corrSxy: 0,
        attendanceRatioSum: 0,
      };
      item.observations += record.observations;
      item.occupancySum += record.occupancySum;
      if (record.operationalMax > item.operationalMax) {
        item.operationalMax = record.operationalMax;
        item.peakHeadcount = record.peakHeadcount;
        item.peakCapacity = record.peakCapacity;
        item.peakTimestamp = record.peakTimestamp;
      }
      ["plannedHours", "plannedGap", "timetableHours", "timetableCapacity", "timetablePlanned", "timetableSpare", "timetableOverCapacityHours", "registeredHours", "ghostHours", "theatreScheduledHours", "emptySeatHours", "availableSeatHours", "corrN", "corrSx", "corrSy", "corrSxx", "corrSyy", "corrSxy", "attendanceRatioSum"].forEach((field) => {
        item[field] += Number(record[field] || 0);
      });
      summaries.set(record.room, item);
    });
    return [...summaries.values()].map((item) => ({
      ...item,
      average: metrics.safeDivide(item.occupancySum, item.observations),
      attendanceReliability: metrics.safeDivide(item.attendanceRatioSum, item.registeredHours),
    }));
  }

  function renderFilterSummary() {
    const summaries = roomSummaries();
    const roomCount = summaries.length;
    const weekLabel = state.week === "all" ? "All teaching weeks" : `Week ${state.week}`;
    const categoryLabel = state.category === "all" ? "All space categories" : state.category;
    const detail = state.location !== "all"
      ? roomName(roomByCode.get(state.location))
      : state.type !== "all"
        ? roomTypeLabel(state.type)
        : `${formatNumber(roomCount)} rooms`;
    document.querySelector("#filterSummary").textContent = `${insights.meta.semesters[state.semester]} · ${weekLabel} · ${categoryLabel} · ${detail}`;
  }

  function renderPeriodCoverage() {
    const period = window.CAMPUS_CONTEXT?.meta.periods.find(p => p.label === insights.meta.semesters[state.semester]);
    if (!period) return;
    const partial = period.weeks.filter(w => !w.complete).map(w => w.week);
    document.querySelector("#periodCoverage").textContent = period.partial
      ? `${period.label}: available through ${period.observedEnd}. Week ${partial.join(", ")} is partial and excluded from same-room year comparisons.`
      : `${period.label}: ${period.start} to ${period.observedEnd}. Illustrative calendar: 12 weeks and a fictional closure in week 7.`;
    document.querySelector("#heroPeriod").textContent = state.week === "all"
      ? (period.partial ? "11 weeks + partial" : period.weeks.length + " weeks")
      : `Week ${state.week}${partial.includes(state.week) ? " · partial" : ""}`;
    document.querySelectorAll("#weekFilter option").forEach(option => {
      if(option.value!=="all")option.textContent=`Week ${option.value}${partial.includes(Number(option.value))?" (partial)":""}`;
    });
  }

  function renderKeyDateContext() {
    const text = document.querySelector("#keyDateText");
    const semesterEvents = (keyDates.events || []).filter((event) => event.semesterIndex === state.semester && event.excludedRows > 0);
    const activeEvents = state.week === "all" ? [] : semesterEvents.filter((event) => event.affectedWeeks?.includes(Number(state.week)));
    if (activeEvents.length) {
      const names = activeEvents.map((event) => event.label).join(" and ");
      text.textContent = state.holidayMode === "adjusted"
        ? `${names} observations are excluded from this week.`
        : `${names} observations are included in Observed mode.`;
      return;
    }
    const affected = semesterEvents.reduce((sum, event) => sum + Number(event.excludedRows || 0), 0);
    text.textContent = state.holidayMode === "adjusted"
      ? `Adjusted mode excludes ${formatNumber(affected)} supported key-date readings in this semester.`
      : `Observed mode retains ${formatNumber(affected)} supported key-date readings in this semester.`;
  }

  function renderTypeProfile() {
    const profile = document.querySelector("#typeProfile");
    const info = state.type === "all" ? null : spaceTypes.types?.[state.type];
    const visible = ["diagnostics", "energy"].includes(state.view) && state.type !== "all";
    profile.hidden = !visible;
    if (!visible) return;
    document.querySelector("#typeProfile .section-kicker").textContent = info ? "Demo room type" : "Source room type";
    if (!info) {
      const room = base.rooms.find(r => r.type === state.type);
      document.querySelector("#typeProfileTitle").textContent = room?.description || state.type;
      document.querySelector("#typeProfileSummary").textContent = "No synthetic definition is available for this room type.";
      document.querySelector("#typeProfileMeta").replaceChildren(profileChip(state.type), profileChip("Definition unavailable"));
      return;
    }
    document.querySelector("#typeProfileTitle").textContent = info.name;
    document.querySelector("#typeProfileSummary").textContent = info.summary;
    document.querySelector("#typeProfileMeta").replaceChildren(
      profileChip(info.sisfmAbbreviation),
      profileChip(`Type ${info.typeCode}`),
      profileChip(`Category ${info.categoryCode}`),
    );
  }

  function profileChip(text) {
    const item = document.createElement("span");
    item.textContent = text;
    return item;
  }

  function renderHero() {
    const summaries = roomSummaries();
    const observations = sum(summaries, "observations");
    const occupancy = metrics.safeDivide(sum(summaries, "occupancySum"), observations);
    const buildings = new Set(summaries.map((item) => buildingId(base.rooms[item.room])));
    document.querySelector("#heroUtilisation").textContent = formatPercent(occupancy, 1);
    document.querySelector("#heroUtilisationNote").textContent = `${formatNumber(observations)} operational room-hours`;
    document.querySelector("#heroMeter").style.width = `${Math.min(100, occupancy * 100)}%`;
    document.querySelector("#heroRooms").textContent = formatNumber(summaries.length);
    document.querySelector("#heroBuildings").textContent = formatNumber(buildings.size);
    document.querySelector("#heroPeriod").textContent = state.week === "all" ? "12 weeks" : `Week ${state.week}`;
  }

  function renderOverview() {
    const overviewState = effectiveState({ allowRoomDetail: false });
    const buildingRecords = metrics.filterRecords(insights.buildingHours, schemas.building, overviewState, dimensions);
    const buildingObjects = objects(buildingRecords, schemas.building);
    const buildingSummary = metrics.summariseBuildings(buildingObjects);
    const ranked = [...buildingSummary].sort((a, b) => b[state.buildingMetric] - a[state.buildingMetric]);
    const most = ranked[0];
    const least = ranked[ranked.length - 1];
    const under25 = buildingSummary.filter((item) => item.max < 0.25);
    const roomSummary = roomSummaries({ allowRoomDetail: false });
    const observations = sum(roomSummary, "observations");
    const average = metrics.safeDivide(sum(roomSummary, "occupancySum"), observations);

    document.querySelector("#kpiOccupancy").textContent = formatPercent(average, 1);
    document.querySelector("#kpiOccupancyNote").textContent = `${formatNumber(observations)} operational room-hours`;
    document.querySelector("#mostBuilding").textContent = most ? insights.buildings[most.building].name : "No data";
    document.querySelector("#mostBuildingNote").textContent = most ? `${metricLabel(state.buildingMetric)} ${formatPercent(most[state.buildingMetric], 1)} · ${formatNumber(most.peakHeadcount)} / ${formatNumber(most.peakCapacity)} at peak` : "No building-hours";
    document.querySelector("#leastBuilding").textContent = least ? insights.buildings[least.building].name : "No data";
    document.querySelector("#leastBuildingNote").textContent = least ? `${metricLabel(state.buildingMetric)} ${formatPercent(least[state.buildingMetric], 1)} · ${formatNumber(least.peakHeadcount)} / ${formatNumber(least.peakCapacity)} at peak` : "No building-hours";
    document.querySelector("#under25Value").textContent = formatNumber(under25.length);
    document.querySelector("#under25Summary").textContent = `${under25.length} of ${buildingSummary.length} buildings · ${formatPercent(metrics.safeDivide(under25.length, buildingSummary.length), 1)}`;

    renderBuildingTable(ranked);
    renderWeeklyChart();
    renderCategoryBars("#categoryBars", { allowRoomDetail: false });
  }

  function renderBuildingTable(ranked) {
    const body = document.querySelector("#buildingTableBody");
    if (!ranked.length) return renderEmptyRow(body, 4, "No building-hours match the active filters.");
    body.replaceChildren(...ranked.map((item) => {
      const row = document.createElement("tr");
      row.innerHTML = `<th scope="row"><strong>${escapeHtml(insights.buildings[item.building].name)}</strong><span>${formatNumber(item.hours)} building-hours</span></th><td>${formatPercent(item.average, 1)}</td><td><span class="value-pill ${item.max < 0.25 ? "low" : ""}">${formatPercent(item.max, 1)}</span></td><td>${formatNumber(item.peakHeadcount)} / ${formatNumber(item.peakCapacity)}</td>`;
      return row;
    }));
  }

  function renderWeeklyChart() {
    const records = objects(filteredRecords(insights.roomWeeks, schemas.room, { allowRoomDetail: false, ignoreWeek: true }), schemas.room);
    const byWeek = new Map(insights.meta.weeks.map((week) => [week, { observations: 0, occupancySum: 0 }]));
    records.forEach((record) => {
      const item = byWeek.get(record.week);
      item.observations += record.observations;
      item.occupancySum += record.occupancySum;
    });
    const series = [...byWeek.entries()].map(([week, item]) => ({ week, value: metrics.safeDivide(item.occupancySum, item.observations), observations: item.observations }));
    const peak = [...series].sort((a, b) => b.value - a.value)[0];
    document.querySelector("#weeklyPeak").textContent = peak ? `Peak W${String(peak.week).padStart(2, "0")} · ${formatPercent(peak.value, 1)}` : "No data";

    const container = document.querySelector("#weeklyChart");
    if (!series.some((item) => item.observations)) return renderEmpty(container, "No weekly observations match the active filters.");
    const width = Math.max(container.clientWidth, 520);
    const height = 320;
    const margin = { top: 22, right: 24, bottom: 48, left: 58 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const maximum = Math.max(0.5, ...series.map((point) => point.value));
    const yMax = Math.min(1.5, Math.ceil(maximum * 5) / 5);
    const x = (week) => margin.left + ((week - 1) / Math.max(1, insights.meta.weeks.length - 1)) * innerWidth;
    const y = (value) => margin.top + innerHeight - metrics.safeDivide(value, yMax) * innerHeight;
    const svg = createSvg(container, width, height, "Week-by-week average room utilisation");
    [0, 0.5, 1].forEach((portion) => {
      const value = yMax * portion;
      svg.appendChild(svgNode("line", { x1: margin.left, y1: y(value), x2: width - margin.right, y2: y(value), class: "chart-gridline" }));
      svg.appendChild(svgText(margin.left - 12, y(value) + 4, formatPercent(value, 0), "chart-axis", "end"));
    });
    const partialWeeks = new Set((window.CAMPUS_CONTEXT?.meta.periods[state.semester]?.weeks || []).filter(w => !w.complete).map(w => w.week));
    const chartPath = series.map((point,index) => !point.observations ? "" : `${index && series[index-1].observations ? "L" : "M"}${x(point.week)},${y(point.value)}`).join(" ");
    const path = svgNode("path", { d: chartPath, class: "weekly-line" });
    svg.appendChild(path);
    series.forEach((point, index) => {
      if (!point.observations) {
        svg.appendChild(svgText(x(point.week), height - 16, `W${String(point.week).padStart(2,"0")} · —`, "chart-axis", "middle"));
        return;
      }
      const selected = state.week === point.week;
      const circle = svgNode("circle", { cx: x(point.week), cy: y(point.value), r: selected ? 6 : 4.5, class: `weekly-point${selected ? " selected" : ""}`, tabindex: "0", role: "button", "aria-label": `Week ${point.week}${partialWeeks.has(point.week) ? " (partial)" : ""}: ${formatPercent(point.value, 1)}. Select this week.` });
      circle.addEventListener("click", () => { state.week = selected ? "all" : point.week; renderAll(); });
      circle.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); circle.click(); } });
      circle.addEventListener("mouseenter", (event) => showTooltip(event, `<strong>Week ${point.week}${partialWeeks.has(point.week) ? " · partial coverage" : ""}</strong><span>${formatPercent(point.value, 1)} · ${formatNumber(point.observations)} room-hours</span>`));
      circle.addEventListener("mouseleave", hideTooltip);
      svg.appendChild(circle);
      svg.appendChild(svgText(x(point.week), height - 16, `W${String(point.week).padStart(2, "0")}${partialWeeks.has(point.week) ? "*" : ""}`, "chart-axis", "middle"));
      if (motionEnabled) window.gsap.fromTo(circle, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18, delay: 0.18 + index * 0.045, ease: "none" });
    });
    if (motionEnabled) {
      const length = path.getTotalLength();
      window.gsap.fromTo(path, { strokeDasharray: length, strokeDashoffset: length }, { strokeDashoffset: 0, duration: 0.72, ease: "power2.out" });
    }
  }

  function renderCategoryBars(selector, options = {}) {
    const records = objects(filteredRecords(insights.roomWeeks, schemas.room, { ...options, ignoreCategory: true }), schemas.room);
    const grouped = new Map();
    records.forEach((record) => {
      const category = base.rooms[record.room].category;
      const item = grouped.get(category) || { observations: 0, occupancySum: 0, rooms: new Set() };
      item.observations += record.observations;
      item.occupancySum += record.occupancySum;
      item.rooms.add(record.room);
      grouped.set(category, item);
    });
    const values = [...grouped.entries()].map(([category, item]) => ({ category, average: metrics.safeDivide(item.occupancySum, item.observations), rooms: item.rooms.size })).sort((a, b) => b.average - a.average);
    const container = document.querySelector(selector);
    if (!values.length) return renderEmpty(container, "No room categories match the active filters.");
    container.replaceChildren(...values.map((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `category-bar${state.category === item.category ? " active" : ""}`;
      button.setAttribute("aria-pressed", String(state.category === item.category));
      button.innerHTML = `<span><strong>${escapeHtml(item.category)}</strong><small>${item.rooms} rooms</small></span><i><b style="width:${Math.min(100, item.average * 100)}%"></b></i><em>${formatPercent(item.average, 1)}</em>`;
      button.addEventListener("click", () => { state.category = state.category === item.category ? "all" : item.category; state.type = "all"; state.location = "all"; renderAll(); });
      return button;
    }));
  }

  function renderTemporal() {
    const mode = state.temporalMode;
    const theatre = mode.startsWith("theatre");
    const byHour = mode.endsWith("hour");
    const title = theatre ? `Lecture theatre × ${byHour ? "hour" : "weekday"}` : `Building × ${byHour ? "hour" : "weekday"}`;
    document.querySelector("#temporalTitle").textContent = title;
    document.querySelector("#temporalDescription").textContent = `Maximum ${theatre ? "room" : "concurrent building"} occupancy for each ${byHour ? "hour of day" : "weekday"}.`;
    document.querySelectorAll("#temporalMode button").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));

    let source;
    let entityLabel;
    if (theatre) {
      source = objects(filteredRecords(insights.theatreHours, schemas.theatre, { allowRoomDetail: false }), schemas.theatre);
      entityLabel = (index) => roomName(base.rooms[index]);
    } else {
      source = objects(filteredRecords(insights.buildingHours, schemas.building, { allowRoomDetail: false }), schemas.building);
      entityLabel = (index) => insights.buildings[index].name;
    }
    const result = aggregateTemporal(source, theatre ? "room" : "building", byHour ? "hour" : "weekday", !theatre);
    const axes = byHour ? insights.meta.hours : [0, 1, 2, 3, 4, 5, 6];
    const axisLabels = byHour ? axes.map(formatHour) : insights.meta.weekdays;
    const container = document.querySelector("#temporalHeatmap");
    if (!result.entities.length) {
      document.querySelector("#temporalPeak").textContent = theatre && state.category !== "all" && state.category !== "Lecture Theatre" ? "Select All space categories or Lecture Theatre to view theatre patterns." : "No operational hours match the active filters.";
      return renderEmpty(container, "No heatmap cells are available for this selection.");
    }
    const peak = result.peak;
    document.querySelector("#temporalPeak").textContent = `${entityLabel(peak.entity)} peaks on ${byHour ? formatHour(peak.axis) : insights.meta.weekdays[peak.axis]} at ${formatPercent(peak.rate, 1)} (${formatNumber(peak.headcount)} people / ${formatNumber(peak.capacity)} seats).`;

    const matrix = document.createElement("div");
    matrix.className = "heat-matrix";
    matrix.style.gridTemplateColumns = `minmax(220px, 1.45fr) repeat(${axes.length}, minmax(70px, 1fr))`;
    matrix.appendChild(matrixHeader(theatre ? "Lecture theatre" : "Building"));
    axisLabels.forEach((label) => matrix.appendChild(matrixHeader(label)));
    result.entities.forEach((entity) => {
      const label = document.createElement("div");
      label.className = "matrix-row-label";
      label.textContent = entityLabel(entity.entity);
      label.title = entityLabel(entity.entity);
      matrix.appendChild(label);
      axes.forEach((axis) => {
        const cellData = result.cells.get(`${entity.entity}|${axis}`);
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "heat-cell";
        cell.dataset.heatCell = "";
        if (!cellData) {
          cell.classList.add("empty");
          cell.textContent = "—";
          cell.disabled = true;
        } else {
          cell.style.backgroundColor = heatColor(cellData.rate);
          cell.textContent = formatPercent(cellData.rate, 0);
          cell.setAttribute("aria-label", `${entityLabel(entity.entity)}, ${byHour ? formatHour(axis) : insights.meta.weekdays[axis]}: ${formatPercent(cellData.rate, 1)}, ${formatNumber(cellData.headcount)} people of ${formatNumber(cellData.capacity)} seats.`);
          cell.addEventListener("mouseenter", (event) => showTooltip(event, `<strong>${escapeHtml(entityLabel(entity.entity))}</strong><span>${byHour ? formatHour(axis) : insights.meta.weekdays[axis]} · ${formatPercent(cellData.rate, 1)}<br>${formatNumber(cellData.headcount)} people / ${formatNumber(cellData.capacity)} seats</span>`));
          cell.addEventListener("mouseleave", hideTooltip);
        }
        matrix.appendChild(cell);
      });
    });
    container.replaceChildren(matrix);
  }

  function aggregateTemporal(records, entityField, axisField, combineConcurrent) {
    let prepared = records;
    if (combineConcurrent) {
      const concurrent = new Map();
      records.forEach((record) => {
        const key = `${record[entityField]}|${record.date}|${record.hour}`;
        const item = concurrent.get(key) || { ...record, headcount: 0, capacity: 0 };
        item.headcount += record.headcount;
        item.capacity += record.capacity;
        concurrent.set(key, item);
      });
      prepared = [...concurrent.values()];
    }
    const cells = new Map();
    const entityMax = new Map();
    let peak = null;
    prepared.forEach((record) => {
      if (!record.capacity) return;
      const rate = record.headcount / record.capacity;
      const axis = record[axisField];
      const key = `${record[entityField]}|${axis}`;
      const previous = cells.get(key);
      if (!previous || rate > previous.rate) cells.set(key, { entity: record[entityField], axis, rate, headcount: record.headcount, capacity: record.capacity });
      entityMax.set(record[entityField], Math.max(entityMax.get(record[entityField]) || 0, rate));
      if (!peak || rate > peak.rate) peak = { entity: record[entityField], axis, rate, headcount: record.headcount, capacity: record.capacity };
    });
    const entities = [...entityMax.entries()].map(([entity, max]) => ({ entity, max })).sort((a, b) => b.max - a.max);
    return { cells, entities, peak };
  }

  function matrixHeader(text) {
    const item = document.createElement("div");
    item.className = "matrix-header";
    item.textContent = text;
    return item;
  }

  function renderDiagnostics() {
    const summaries = roomSummaries();
    const timetableRooms = summaries
      .filter((item) => item.timetableHours > 0)
      .map((item) => ({
        ...item,
        plannedFill: metrics.safeDivide(item.timetablePlanned, item.timetableCapacity),
        averagePlanned: metrics.safeDivide(item.timetablePlanned, item.timetableHours),
        averageSpare: metrics.safeDivide(item.timetableSpare, item.timetableHours),
        attendanceShortfall: item.plannedHours ? metrics.safeDivide(item.plannedGap, item.plannedHours) : null,
      }))
      .sort((a, b) => Math.abs(1 - b.plannedFill) - Math.abs(1 - a.plannedFill) || b.timetableHours - a.timetableHours);
    const outliers = objects(filteredRecords(insights.outliers, schemas.outlier), schemas.outlier).sort((a, b) => b.utilisation - a.utilisation);
    const timetableHours = sum(timetableRooms, "timetableHours");
    const timetableCapacity = sum(timetableRooms, "timetableCapacity");
    const timetablePlanned = sum(timetableRooms, "timetablePlanned");
    const timetableSpare = sum(timetableRooms, "timetableSpare");
    const overCapacityHours = sum(timetableRooms, "timetableOverCapacityHours");
    document.querySelector("#gapRoomCount").textContent = formatNumber(timetableRooms.length);
    document.querySelector("#plannedFitValue").textContent = timetableHours ? formatPercent(metrics.safeDivide(timetablePlanned, timetableCapacity), 1) : "—";
    document.querySelector("#plannedFitNote").textContent = timetableHours ? `${formatNumber(metrics.safeDivide(timetableSpare, timetableHours), 1)} average spare seats / scheduled room-hour` : "No planned-size records";
    document.querySelector("#overplannedValue").textContent = formatNumber(overCapacityHours);
    document.querySelector("#overplannedNote").textContent = timetableHours ? `${formatPercent(metrics.safeDivide(overCapacityHours, timetableHours), 1)} of ${formatNumber(timetableHours)} planned room-hours` : "No planned-size records";
    document.querySelector("#outlierCount").textContent = formatNumber(outliers.length);
    renderTimetableTable(timetableRooms);
    renderOutlierTable(outliers);
    renderCategoryBars("#diagnosticCategoryBars", { allowRoomDetail: false });
  }

  function renderTimetableTable(timetableRooms) {
    const body = document.querySelector("#timetableTableBody");
    if (!timetableRooms.length) return renderEmptyRow(body, 7, "No planned-size records match the active filters.");
    body.replaceChildren(...timetableRooms.slice(0, 40).map((item) => {
      const room = base.rooms[item.room];
      const fillClass = item.plannedFill > 1 ? "danger" : item.plannedFill < 0.5 ? "low" : "";
      const spareClass = item.averageSpare < 0 ? "danger" : item.averageSpare > 25 ? "low" : "";
      const row = document.createElement("tr");
      row.innerHTML = `<th scope="row"><strong>${escapeHtml(roomName(room))}</strong><span>${escapeHtml(room.code)}</span></th><td>${formatNumber(item.timetableHours)}</td><td>${formatNumber(metrics.safeDivide(item.timetableCapacity, item.timetableHours), 1)}</td><td>${formatNumber(item.averagePlanned, 1)}</td><td><span class="value-pill ${spareClass}">${formatNumber(item.averageSpare, 1)}</span></td><td><span class="value-pill ${fillClass}">${formatPercent(item.plannedFill, 1)}</span></td><td>${item.attendanceShortfall == null ? "—" : formatNumber(item.attendanceShortfall, 1)}</td>`;
      return row;
    }));
  }

  function renderOutlierTable(outliers) {
    const body = document.querySelector("#outlierTableBody");
    const note = document.querySelector("#outlierTableNote");
    note.textContent = outliers.length > 100 ? `Showing the highest 100 of ${formatNumber(outliers.length)} filtered raw exceptions; all remain in the data layer.` : `${formatNumber(outliers.length)} raw exceptions; excluded from operational analytics.`;
    if (!outliers.length) return renderEmptyRow(body, 5, "No >150% observations match the active filters.");
    body.replaceChildren(...outliers.slice(0, 100).map((item) => {
      const room = base.rooms[item.room];
      const row = document.createElement("tr");
      row.innerHTML = `<td><code>${escapeHtml(room.code)}</code></td><th scope="row">${escapeHtml(roomName(room))}</th><td>${formatNumber(item.headcount)} / ${formatNumber(item.capacity)}</td><td><span class="value-pill danger">${formatPercent(item.utilisation, 0)}</span></td><td>${formatTimestamp(item.timestamp)}</td>`;
      return row;
    }));
  }

  function renderEnergy() {
    const summaries = roomSummaries();
    const ghost = metrics.summariseGhosts(summaries.map((item) => ({ eligible: item.registeredHours, ghost: item.ghostHours })));
    const energy = metrics.summariseEnergy(summaries.map((item) => ({ emptySeatHours: item.emptySeatHours, availableSeatHours: item.availableSeatHours })));
    const registeredHours = sum(summaries, "registeredHours");
    const ratioSum = sum(summaries, "attendanceRatioSum");
    const reliability = metrics.safeDivide(ratioSum, registeredHours);

    const activityRecords = objects(filteredRecords(insights.activityMoments, schemas.activity), schemas.activity);
    const activityEligible = sum(activityRecords, "n");
    const coverage = metrics.safeDivide(activityEligible, registeredHours);
    document.querySelector("#ghostCount").textContent = formatNumber(ghost.ghost);
    document.querySelector("#ghostShare").textContent = `${formatPercent(ghost.share, 1)} of ${formatNumber(ghost.eligible)} eligible room-hours`;
    document.querySelector("#attendanceReliability").textContent = registeredHours ? formatPercent(reliability, 1) : "—";
    document.querySelector("#energyEmptySeats").textContent = formatCompact(energy.emptySeatHours);
    document.querySelector("#energyRate").textContent = `${formatPercent(energy.rate, 1)} of ${formatCompact(energy.availableSeatHours)} available seat-hours`;
    document.querySelector("#activityCoverageValue").textContent = registeredHours ? formatPercent(coverage, 1) : "—";
    document.querySelector("#activityCoverage").textContent = `${formatNumber(activityEligible)} of ${formatNumber(registeredHours)} eligible hours · coverage`;

    renderGhostRooms(summaries);
    renderEnergyRooms(summaries);
    renderActivityTable(activityRecords);
    renderSpaceCorrelation(summaries);
  }

  function renderGhostRooms(summaries) {
    const values = summaries.filter((item) => item.registeredHours > 0).map((item) => ({ ...item, share: metrics.safeDivide(item.ghostHours, item.registeredHours) })).sort((a, b) => b.ghostHours - a.ghostHours || b.share - a.share);
    renderRankList("#ghostRoomList", values.slice(0, 12), (item) => ({
      title: roomName(base.rooms[item.room]),
      meta: `${formatNumber(item.ghostHours)} ghost hours · ${formatNumber(item.registeredHours)} eligible`,
      value: formatPercent(item.share, 1),
      progress: item.share,
      room: base.rooms[item.room],
    }), "No registered room-hours match the active filters.");
  }

  function renderEnergyRooms(summaries) {
    const values = summaries.filter((item) => item.theatreScheduledHours > 0).map((item) => ({ ...item, rate: metrics.safeDivide(item.emptySeatHours, item.availableSeatHours) })).sort((a, b) => b.emptySeatHours - a.emptySeatHours);
    const maximum = values[0]?.emptySeatHours || 1;
    renderRankList("#energyRoomList", values.slice(0, 12), (item) => ({
      title: roomName(base.rooms[item.room]),
      meta: `${formatCompact(item.emptySeatHours)} empty seat-hours · ${formatPercent(item.rate, 1)} empty`,
      value: formatCompact(item.emptySeatHours),
      progress: item.emptySeatHours / maximum,
      room: base.rooms[item.room],
    }), "No scheduled lecture-theatre hours match the active filters.");
  }

  function renderRankList(selector, values, describe, emptyMessage) {
    const container = document.querySelector(selector);
    if (!values.length) return renderEmpty(container, emptyMessage);
    container.replaceChildren(...values.map((value, index) => {
      const item = describe(value);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rank-item";
      button.innerHTML = `<span class="rank-number">${String(index + 1).padStart(2, "0")}</span><span class="rank-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.meta)}</small><i><b style="width:${Math.min(100, item.progress * 100)}%"></b></i></span><em>${escapeHtml(item.value)}</em>`;
      if (item.room) button.addEventListener("click", () => { state.type = item.room.type; state.location = item.room.code; renderAll(); });
      return button;
    }));
  }

  function renderActivityTable(records) {
    const grouped = new Map();
    records.forEach((record) => {
      const item = grouped.get(record.activity) || [];
      item.push(record);
      grouped.set(record.activity, item);
    });
    const values = [...grouped.entries()].map(([activity, rows]) => {
      const moment = metrics.sumMoments(rows);
      return { activity, ...moment, reliability: metrics.safeDivide(moment.ratioSum, moment.n), ghostShare: metrics.safeDivide(moment.ghost, moment.n), correlation: metrics.pearsonFromMoments(moment) };
    }).sort((a, b) => b.n - a.n);
    const body = document.querySelector("#activityTableBody");
    if (!values.length) return renderEmptyRow(body, 5, "No activity-type records match the active filters.");
    body.replaceChildren(...values.map((item) => {
      const row = document.createElement("tr");
      row.innerHTML = `<th scope="row">${escapeHtml(insights.meta.activities[item.activity])}</th><td>${formatNumber(item.n)}</td><td>${formatPercent(item.reliability, 1)}</td><td>${formatPercent(item.ghostShare, 1)}</td><td>${formatCorrelation(item.correlation)}</td>`;
      return row;
    }));
  }

  function renderSpaceCorrelation(summaries) {
    const grouped = new Map();
    summaries.forEach((item) => {
      const category = base.rooms[item.room].category;
      const values = grouped.get(category) || [];
      values.push({ n: item.corrN, sx: item.corrSx, sy: item.corrSy, sxx: item.corrSxx, syy: item.corrSyy, sxy: item.corrSxy, ratioSum: item.attendanceRatioSum, ghost: item.ghostHours });
      grouped.set(category, values);
    });
    const values = [...grouped.entries()].map(([category, rows]) => {
      const moment = metrics.sumMoments(rows);
      return { category, ...moment, reliability: metrics.safeDivide(moment.ratioSum, moment.n), ghostShare: metrics.safeDivide(moment.ghost, moment.n), correlation: metrics.pearsonFromMoments(moment) };
    }).filter((item) => item.n > 0).sort((a, b) => b.n - a.n);
    const body = document.querySelector("#spaceCorrelationBody");
    if (!values.length) return renderEmptyRow(body, 5, "No registered room-hours match the active filters.");
    body.replaceChildren(...values.map((item) => {
      const row = document.createElement("tr");
      row.innerHTML = `<th scope="row">${escapeHtml(item.category)}</th><td>${formatNumber(item.n)}</td><td>${formatPercent(item.reliability, 1)}</td><td>${formatPercent(item.ghostShare, 1)}</td><td>${formatCorrelation(item.correlation)}</td>`;
      return row;
    }));
  }

  function updateSourceLabels() {
    const min = new Date(base.meta.dateMin);
    const max = new Date(base.meta.dateMax);
    const range = `${min.toLocaleDateString("en-AU", { month: "short", year: "numeric" })}–${max.toLocaleDateString("en-AU", { month: "short", year: "numeric" })}`;
    document.querySelector("#sourceSummary").textContent = `${formatNumber(base.meta.sourceRows)} readings · ${range}`;
    document.querySelector("#sourceNote").textContent = `Source: ${base.meta.source}. ${formatNumber(base.rooms.length)} rooms across ${insights.buildings.length} mapped buildings.`;
  }

  function updateScrollProgress() {
    const available = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = available > 0 ? window.scrollY / available : 0;
    document.querySelector(".scroll-progress span").style.transform = `scaleX(${Math.max(0, Math.min(1, ratio))})`;
  }

  function buildingId(room) {
    return `${room.campus || room.code.split(";")[0]};${room.buildingCode || room.code.split(";")[1]}`;
  }

  function roomTypeLabel(value) {
    return spaceTypes.types?.[value]?.sisfmAbbreviation || value;
  }

  function roomName(room) {
    return room?.shortName || room?.displayName || room?.code || "Unknown room";
  }

  function metricLabel(metric) {
    return metric === "average" ? "Average" : "Operational max";
  }

  function sum(records, field) {
    return records.reduce((total, record) => total + Number(record[field] || 0), 0);
  }

  function formatNumber(value, maximumFractionDigits = 0) {
    return new Intl.NumberFormat("en-AU", { maximumFractionDigits }).format(Number(value || 0));
  }

  function formatCompact(value) {
    return new Intl.NumberFormat("en-AU", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0));
  }

  function formatPercent(value, digits = 1) {
    if (!Number.isFinite(Number(value))) return "—";
    return `${(Number(value) * 100).toFixed(digits)}%`;
  }

  function formatCorrelation(value) {
    return value === null || !Number.isFinite(value) ? "Insufficient variance" : `r ${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
  }

  function formatHour(hour) {
    const suffix = hour >= 12 ? "pm" : "am";
    const value = hour % 12 || 12;
    return `${value}${suffix}`;
  }

  function formatTimestamp(value) {
    const date = new Date(value);
    return date.toLocaleString("en-AU", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function heatColor(value) {
    const ratio = Math.max(0, Math.min(1, value / insights.meta.operationalThreshold));
    const lightness = 18 + ratio * 43;
    const saturation = 34 + ratio * 48;
    return `hsl(211 ${saturation}% ${lightness}%)`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  function createSvg(container, width, height, label) {
    container.replaceChildren();
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
    container.appendChild(svg);
    return svg;
  }

  function svgNode(name, attributes = {}) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function svgText(x, y, text, className, anchor = "start") {
    const node = svgNode("text", { x, y, class: className, "text-anchor": anchor });
    node.textContent = text;
    return node;
  }

  function linePath(points) {
    return points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  }

  function renderEmpty(container, message) {
    const item = document.createElement("div");
    item.className = "empty-state";
    item.textContent = message;
    container.replaceChildren(item);
  }

  function renderEmptyRow(body, columns, message) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="${columns}"><div class="empty-state">${escapeHtml(message)}</div></td>`;
    body.replaceChildren(row);
  }

  function showTooltip(event, html) {
    const tooltip = document.querySelector("#chartTooltip");
    tooltip.innerHTML = html;
    tooltip.setAttribute("aria-hidden", "false");
    tooltip.classList.add("visible");
    const x = Math.min(window.innerWidth - 260, event.clientX + 14);
    const y = Math.min(window.innerHeight - 120, event.clientY + 14);
    tooltip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  }

  function hideTooltip() {
    const tooltip = document.querySelector("#chartTooltip");
    tooltip.classList.remove("visible");
    tooltip.setAttribute("aria-hidden", "true");
  }
})();
