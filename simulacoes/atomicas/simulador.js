'use strict';

const byId = id => document.getElementById(id);
const address = '0x1000';

function createBoard() {
  const coreMarkup = index => `
    <section class="core" id="core${index}" aria-labelledby="heading${index}">
      <div class="core-heading">
        <h2 id="heading${index}">Núcleo ${index}</h2>
        <p id="progress${index}"></p>
      </div>
      <div class="component" id="decode-box${index}" data-kind="control">
        <span class="component-title">Decodificador</span>
        <span class="signal" id="decode${index}"></span>
      </div>
      <div class="route" data-kind="control" id="dispatch${index}"><span></span></div>
      <div class="compute">
        <div class="component" id="register-box${index}" data-kind="data">
          <span class="component-title">Registradores</span>
          <div class="signal">RDI = ${address}</div>
          <div class="signal" id="eax${index}"></div>
        </div>
        <div class="route local" data-kind="data" id="local${index}"><span></span></div>
        <div class="component" id="alu-box${index}" data-kind="data">
          <span class="component-title">ULA · soma inteira</span>
          <span class="signal" id="alu${index}"></span>
        </div>
      </div>
      <div class="route" data-kind="data" id="operands${index}"><span></span></div>
      <div class="component" id="lsu-box${index}" data-kind="data">
        <span class="component-title">Unidade de leitura e escrita</span>
        <span class="signal" id="lsu${index}"></span>
      </div>
      <div class="route" data-kind="data" id="cache-route${index}"><span></span></div>
      <div class="component" id="cache-box${index}" data-kind="coherence">
        <span class="component-title">Cache L1 de dados · L1D</span>
        <div class="line">
          <span class="cache-state" id="cache-state${index}"></span>
          <span class="line-value" id="cache-value${index}"></span>
        </div>
      </div>
    </section>`;

  byId('board').innerHTML = `
    <div class="cores">${coreMarkup(0)}${coreMarkup(1)}</div>
    <div class="cores">
      <div class="route coherence" data-kind="coherence" id="fabric0"><span></span></div>
      <div class="route coherence" data-kind="coherence" id="fabric1"><span></span></div>
    </div>
    <div class="interconnect" id="fabric">
      <h2>Interconexão · transporte de mensagens</h2>
      <p class="signal" id="traffic"></p>
      <ul class="packets" id="packets" aria-label="Mensagens em trânsito"></ul>
    </div>
    <div class="route coherence" data-kind="coherence" id="directory-route"><span></span></div>
    <div class="directory" id="directory">
      <h2>Controlador de coerência</h2>
      <dl>
        <div><dt>Diretório da linha</dt><dd id="entry"></dd></div>
        <div><dt>Ação do controlador</dt><dd id="decision"></dd></div>
        <div><dt>Fila da linha</dt><dd id="pending"></dd></div>
      </dl>
    </div>
    <div class="route coherence" data-kind="coherence" id="backing-route"><span></span></div>
    <div class="memory-row">
      <div class="memory">
        <h2>Hierarquia abaixo dos L1</h2>
        <p>Cópia inferior · <span class="line-value" id="backing"></span></p>
      </div>
      <div class="counter-value">
        <h2>Valor coerente do contador</h2>
        <strong class="line-value" id="counter"></strong>
      </div>
    </div>
    <ul class="legend" aria-label="Tipos de sinal">
      <li data-kind="control">Instrução e controle</li>
      <li data-kind="data">Caminho de dados</li>
      <li data-kind="coherence">Mensagens de coerência</li>
    </ul>`;
}

function route(id, [direction, label] = []) {
  const link = byId(id);
  for (const name of ['up', 'down', 'both', 'across', 'roundtrip']) {
    link.toggleAttribute('data-' + name, direction === name);
  }
  link.firstElementChild.textContent = label || '';
}

function component(id, index, detail) {
  const active = Boolean(detail);
  byId(id + '-box' + index).dataset.active = active;
  const signal = byId(id + index);
  signal.textContent = detail || '—';
  signal.classList.toggle('active-value', active);
}

function showCoherence(machine, activity) {
  const owner = machine.cores.findIndex(core => core.cache === 'M' || core.cache === 'E');
  const sharers = machine.cores.flatMap((core, index) => core.cache === 'S' ? [l1(index)] : []);
  const entry = owner === -1 ? 'Compartilhantes: ' + sharers.join(' e ') : 'Permissão exclusiva: ' + l1(owner);
  const messages = activity.packets || [];
  const list = byId('packets');
  list.replaceChildren();
  list.hidden = messages.length === 0;
  for (const message of messages) {
    const item = document.createElement('li');
    const opcode = document.createElement('code');
    opcode.textContent = message.name;
    const path = document.createElement('span');
    path.textContent = message.from + ' → ' + message.to;
    item.append(opcode, path);
    list.append(item);
  }
  byId('fabric').dataset.active = messages.length > 0;
  byId('traffic').textContent = activity.traffic || 'Sem tráfego para essa linha';
  byId('directory').dataset.active = Boolean(activity.decision);
  byId('entry').textContent = entry;
  byId('decision').textContent = activity.decision || 'Nenhuma transação pendente';
  byId('pending').textContent = activity.waiting.length
    ? activity.waiting.map(index => 'Núcleo ' + index).join(', ') + ' aguarda'
    : 'Sem pedidos na fila';
  route('directory-route', activity.directoryRoute);
}

function showBoard(machine, activity) {
  machine.cores.forEach((core, index) => {
    const signals = activity.cores?.[index] || {};
    byId('core' + index).dataset.active = activity.active.includes(index);
    byId('progress' + index).textContent = core.progress;
    byId('register-box' + index).dataset.active = Boolean(signals.register);
    byId('eax' + index).textContent = 'EAX = ' + (core.eax ?? '—');
    component('decode', index, signals.decode);
    component('alu', index, signals.alu);
    component('lsu', index, signals.lsu);

    const state = byId('cache-state' + index);
    state.dataset.state = core.cache;
    state.textContent = core.cache;
    byId('cache-box' + index).dataset.active = Boolean(signals.cache);
    byId('cache-value' + index).textContent = core.cache === 'I'
      ? 'Sem cópia válida'
      : `[${address}] = ${core.data}`;

    route('dispatch' + index, signals.dispatch);
    route('local' + index, signals.local);
    route('operands' + index, signals.operands);
    route('cache-route' + index, signals.cacheRoute);
    route('fabric' + index, signals.fabric);
  });

  showCoherence(machine, activity);
  route('backing-route', activity.backingRoute);
  byId('backing').textContent = machine.backing;
  byId('counter').textContent = machine.counter;
}

function describe(label, title, explanation) {
  byId('event-label').textContent = label;
  byId('event-title').textContent = title;
  byId('explanation').textContent = explanation;
}

function renderTimeline(tracks, duration) {
  const grid = byId('timeline');
  grid.replaceChildren();
  grid.className = 'timeline';
  grid.style.setProperty('--duration', duration);

  const axes = document.createElement('div');
  axes.className = 'timeline-row timeline-axis';
  const axisLabel = document.createElement('span');
  axisLabel.textContent = 'Tempo relativo';
  const scale = document.createElement('div');
  scale.className = 'timeline-scale';
  for (const tick of [0, Math.round(duration / 3), Math.round(duration * 2 / 3), duration]) {
    const mark = document.createElement('span');
    mark.style.left = (tick / duration) * 100 + '%';
    mark.textContent = tick;
    scale.append(mark);
  }
  axes.append(axisLabel, scale);
  grid.append(axes);

  const bars = tracks.flatMap(track => {
    const row = document.createElement('div');
    row.className = 'timeline-row';
    const label = document.createElement('span');
    label.className = 'timeline-label';
    label.textContent = track.label;
    const rail = document.createElement('div');
    rail.className = 'timeline-track';
    rail.setAttribute('role', 'list');
    rail.setAttribute('aria-label', track.label);
    row.append(label, rail);
    grid.append(row);

    const occupiedUntil = [];
    const markers = track.intervals.toSorted((a, b) => a.start - b.start).map(span => {
      let lane = occupiedUntil.findIndex(end => end <= span.start);
      if (lane === -1) lane = occupiedUntil.length;
      occupiedUntil[lane] = span.end;

      const bar = document.createElement('span');
      bar.className = 'timeline-bar';
      bar.dataset.kind = span.kind;
      bar.style.setProperty('--lane', lane);
      bar.style.left = (span.start / duration) * 100 + '%';
      bar.style.width = ((span.end - span.start) / duration) * 100 + '%';
      bar.setAttribute('role', 'listitem');
      bar.setAttribute('aria-label', `${span.label}, de ${span.start} a ${span.end}`);
      bar.textContent = span.label;
      rail.append(bar);
      return { bar, span };
    });
    rail.style.setProperty('--lanes', Math.max(1, occupiedUntil.length));
    return markers;
  });

  return time => {
    grid.style.setProperty('--cursor', (time / duration) * 100 + '%');
    for (const { bar, span } of bars) bar.dataset.active = isActive(span, time);
  };
}

function isActive(span, time) {
  return span.start <= time && time < span.end;
}

function routeFor(messages, endpoint) {
  const sends = messages.some(message => message.from === endpoint);
  const receives = messages.some(message => message.to === endpoint);
  if (sends && receives) return ['both', 'Troca de mensagens'];
  if (sends) return [endpoint === controller ? 'up' : 'down', 'Enviar'];
  if (receives) return [endpoint === controller ? 'down' : 'up', 'Receber'];
  return undefined;
}

function initSimulation() {
  const hardware = document.body.dataset.page === 'hardware';
  const mode = byId('mode');
  const first = byId('first');
  const offset = byId('offset');
  const timeInput = byId('time');
  const play = byId('play');
  const previous = byId('previous-event');
  const next = byId('next-event');
  const scenarioDescription = byId('scenario-description');
  const defaultDescription = scenarioDescription?.textContent;
  const event = byId('event-title').closest('.event');
  let time;
  let timer;
  let simulation;
  let eventTimes;
  let moveCursor;
  let programs;

  function render() {
    const { tracks, snapshots, duration } = simulation;
    const frame = snapshots.findLast(snapshot => snapshot.time <= time);
    const coreSpans = tracks.slice(0, 2).map(track => track.intervals.find(span => isActive(span, time)));
    const packets = tracks[2].intervals.filter(span => isActive(span, time)).map(span => span.signals);
    const directory = tracks[3].intervals.find(span => isActive(span, time));
    const machine = {
      ...frame.machine,
      cores: frame.machine.cores.map((core, index) => ({
        ...core,
        progress: coreSpans[index]?.label || (core.completed === programs[index].length
          ? 'Programa concluído' : 'Aguardando o início')
      }))
    };
    const activity = {
      ...directory?.signals,
      waiting: frame.waiting,
      packets,
      active: [0, 1].filter(index => coreSpans[index]),
      cores: coreSpans.map((span, index) => {
        const fabric = routeFor(packets, l1(index));
        return { ...span?.signals, fabric, cache: Boolean(fabric || span?.signals.cache) };
      }),
      directoryRoute: routeFor(packets, controller),
      backingRoute: packets.some(message => message.name.startsWith('Writeback'))
        ? ['down', 'Atualização da cópia inferior'] : undefined
    };

    showBoard(machine, activity);
    moveCursor(time);
    timeInput.value = String(time);
    timeInput.setAttribute('aria-valuetext', `Instante ${time} de ${duration}, tempo relativo`);
    previous.disabled = time === 0;
    next.disabled = time === duration;
    describe(`t = ${time} · Tempo relativo`, ...frame.caption);
  }

  function pause() {
    clearInterval(timer);
    timer = undefined;
    play.textContent = 'Reproduzir';
    event.setAttribute('aria-live', 'polite');
  }

  function seek(position) {
    pause();
    time = position;
    render();
  }

  function selectScenario() {
    pause();
    programs = {
      atomic: [atomicProgram, atomicProgram],
      observer: [atomicProgram, ['load']],
      split: [splitProgram, splitProgram]
    }[mode.value];
    const leader = hardware ? 0 : Number(first.value);
    const starts = [0, 0];
    starts[1 - leader] = hardware ? 6 : Number(offset.value);
    simulation = simulateExecution(programs, starts, leader);
    const { tracks, snapshots, duration } = simulation;
    eventTimes = [...new Set([
      ...snapshots.map(frame => frame.time),
      ...tracks.flatMap(track => track.intervals.flatMap(span => [span.start, span.end]))
    ])].sort((a, b) => a - b);
    moveCursor = renderTimeline(tracks, duration);
    timeInput.max = String(duration);
    byId('sequence').textContent = {
      atomic: 'lock xadd [rdi], eax',
      observer: 'lock xadd · mov eax, [rdi]',
      split: 'mov → add → mov'
    }[mode.value];
    if (hardware) {
      scenarioDescription.textContent = mode.value === 'observer'
        ? 'O núcleo 0 incrementa o contador em 0x1000. O núcleo 1 pede a linha durante a soma e recebe 42.'
        : defaultDescription;
    }
    time = hardware ? 7 : 0;
    render();
  }

  timeInput.oninput = () => seek(Number(timeInput.value));
  previous.onclick = () => seek(eventTimes.findLast(position => position < time));
  next.onclick = () => seek(eventTimes.find(position => position > time));
  play.onclick = () => {
    if (timer !== undefined) {
      pause();
      return;
    }
    if (time === simulation.duration) {
      time = 0;
      render();
    }
    play.textContent = 'Pausar';
    event.setAttribute('aria-live', 'off');
    timer = setInterval(() => {
      time += 1;
      render();
      if (time === simulation.duration) pause();
    }, 700);
  };
  byId('reset').onclick = () => seek(0);
  mode.onchange = selectScenario;
  if (!hardware) {
    first.onchange = selectScenario;
    offset.onchange = selectScenario;
  }
  selectScenario();
}

createBoard();
initSimulation();
