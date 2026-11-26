'use strict';

const byId = id => document.getElementById(id);
const rates = [1, 2, 3, 5, 8, 12];
const labels = { [addresses.a]: 'A', [addresses.b]: 'B', [addresses.c]: 'C' };

function populateMemory() {
  return Array.from({ length: 16 }, (_, address) => {
    const cell = document.createElement('li');
    const location = document.createElement('code');
    location.className = 'cell-address';
    location.textContent = hex(address);
    const byte = document.createElement('code');
    byte.className = 'cell-value';
    const label = document.createElement('small');
    cell.append(location, byte, label);
    byId('memory').append(cell);
    return { cell, byte, label };
  });
}

function populateProgram() {
  return words.map((word, address) => {
    const row = document.createElement('tr');
    for (const text of [hex(address), hex(word), decode(word).mnemonic]) {
      const cell = document.createElement('td');
      const code = document.createElement('code');
      code.textContent = text;
      cell.append(code);
      row.append(cell);
    }
    byId('program').append(row);
    return row;
  });
}

function mark(node, active) {
  if (active) node.setAttribute('aria-current', 'step');
  else node.removeAttribute('aria-current');
}

function showBus(id, bus) {
  const element = byId(id);
  element.dataset.active = Boolean(bus);
  const direction = bus?.direction === 'to-memory' ? 'CPU → memória' : 'Memória → CPU';
  element.querySelector('dd').textContent = bus ? bus.value + ' · ' + direction : 'Em repouso';
}

function init() {
  const memory = populateMemory();
  const program = populateProgram();
  const phases = [...document.querySelectorAll('[data-phase]')];
  const registers = [...document.querySelectorAll('[data-register]')];
  const a = byId('a');
  const b = byId('b');
  const inputs = byId('inputs');
  const speed = byId('speed');
  const granularity = byId('granularity');
  const play = byId('play');
  const next = byId('next');
  const previous = byId('previous');
  const status = byId('status');
  const pipeline = setupPipeline();
  let trace;
  let boundaries;
  let position;
  let timer = null;

  function render() {
    const current = trace[position];
    const prior = trace[Math.max(position - 1, 0)];
    status.dataset.dependency = Boolean(current.dependency);
    byId('event-title').textContent = current.title;
    byId('event-detail').textContent = current.detail;
    phases.forEach(phase => mark(phase, phase.dataset.phase === current.phase));
    program.forEach((row, address) => mark(row, address === current.instructionAddress));
    const unit = byId('control-unit');
    unit.dataset.active = Boolean(current.phase) && !current.halted;
    unit.querySelector('dd').textContent = current.halted ? 'CPU parada'
      : { fetch: 'Busca', decode: 'Decodificação', execute: 'Execução' }[current.phase] || 'Pronta para buscar';
    const alu = byId('alu');
    alu.dataset.active = Boolean(current.alu);
    alu.querySelector('dd').textContent = current.alu || 'Em repouso';

    registers.forEach(row => {
      const key = row.dataset.register;
      const value = current.registers[key];
      row.querySelector('dd').textContent = key === 'acc' ? value : hex(value);
      row.dataset.changed = value !== prior.registers[key];
    });
    for (const [key, value] of Object.entries(current.counts)) {
      const node = byId(key);
      node.textContent = value;
      node.dataset.changed = value !== prior.counts[key];
    }

    memory.forEach(({ cell, byte, label }, address) => {
      const value = current.memory[address];
      const name = labels[address];
      byte.textContent = hex(value);
      label.textContent = name ? name + ' · ' + value : address < words.length ? decode(value).name : '·';
      if (address === current.selected) cell.dataset.access = current.access;
      else delete cell.dataset.access;
    });

    showBus('address-bus', current.addressBus);
    showBus('data-bus', current.dataBus);
    const control = current.addressBus?.control || current.dataBus?.control;
    byId('control-bus').dataset.active = Boolean(control);
    byId('control-bus').querySelector('dd').textContent = control || 'Em repouso';
    previous.disabled = position === 0;
    next.disabled = position === trace.length - 1;
  }

  function pause() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    play.textContent = 'Reproduzir';
    status.setAttribute('aria-live', 'polite');
  }

  function schedule() {
    timer = setTimeout(() => {
      position += 1;
      if (position === trace.length - 1) pause();
      render();
      if (timer !== null) schedule();
    }, 1000 / rates[Number(speed.value)]);
  }

  function showSpeed() {
    const rate = rates[Number(speed.value)];
    const caption = rate + (rate === 1 ? ' evento/s' : ' eventos/s');
    byId('rate').textContent = caption;
    speed.setAttribute('aria-valuetext', caption);
  }

  function move(direction) {
    pause();
    if (granularity.value === 'instruction') {
      position = direction > 0
        ? boundaries.find(index => index > position)
        : boundaries.findLast(index => index < position);
    } else {
      position += direction;
    }
    render();
  }

  function loadData() {
    pause();
    trace = simulateVonNeumann(a.valueAsNumber, b.valueAsNumber);
    boundaries = [0, ...trace.flatMap((frame, index) => frame.complete ? [index] : [])];
    position = 0;
    render();
    pipeline.load(a.valueAsNumber, b.valueAsNumber);
  }

  inputs.onsubmit = event => {
    event.preventDefault();
    if (inputs.reportValidity()) loadData();
  };
  byId('reset').onclick = () => {
    pause();
    position = 0;
    render();
  };
  previous.onclick = () => move(-1);
  next.onclick = () => move(1);
  speed.oninput = () => {
    showSpeed();
    if (timer !== null) {
      clearTimeout(timer);
      schedule();
    }
  };
  play.onclick = () => {
    if (timer !== null) {
      pause();
      return;
    }
    if (position === trace.length - 1) {
      position = 0;
      render();
    }
    status.setAttribute('aria-live', 'off');
    play.textContent = 'Pausar';
    schedule();
  };
  showSpeed();
  loadData();
}

function createTimeline(trace, seek) {
  const head = byId('pipeline-columns');
  const body = byId('pipeline-rows');
  const title = document.createElement('th');
  title.textContent = 'Instrução';
  title.scope = 'col';
  head.replaceChildren(title);
  body.replaceChildren();

  const columns = trace.slice(1).map(frame => {
    const column = document.createElement('th');
    const button = document.createElement('button');
    column.scope = 'col';
    button.type = 'button';
    button.textContent = frame.cycle;
    button.setAttribute('aria-label', 'Ver ciclo ' + frame.cycle);
    button.onclick = () => seek(frame.cycle);
    column.append(button);
    head.append(column);
    return { frame, column, button, cells: [] };
  });

  words.forEach((word, address) => {
    const row = document.createElement('tr');
    const label = document.createElement('th');
    const instruction = document.createElement('code');
    label.scope = 'row';
    instruction.textContent = decode(word).mnemonic;
    label.append(instruction);
    row.append(label);
    for (const { frame, cells } of columns) {
      const cell = document.createElement('td');
      const stage = pipelineStages.find(({ key }) => frame.stages[key]?.instruction?.address === address);
      if (stage) {
        const activity = frame.stages[stage.key];
        cell.dataset.stage = stage.key;
        cell.toggleAttribute('data-wait', Boolean(activity.waiting));
        cell.textContent = stage.letter + (activity.waiting ? '*' : '');
        cell.setAttribute('aria-label', stage.label + (activity.waiting ? ', em espera' : ''));
      }
      cells.push(cell);
      row.append(cell);
    }
    body.append(row);
  });

  return cycle => {
    for (const { frame, column, button, cells } of columns) {
      const active = frame.cycle === cycle;
      if (active) button.setAttribute('aria-current', 'time');
      else button.removeAttribute('aria-current');
      for (const cell of [column, ...cells]) cell.dataset.current = active;
    }
  };
}

function setupPipeline() {
  const status = byId('pipeline-status');
  const stageNodes = [...document.querySelectorAll('[data-pipeline-stage]')];
  const speed = byId('pipeline-speed');
  const play = byId('pipeline-play');
  const previous = byId('pipeline-previous');
  const next = byId('pipeline-next');
  let trace;
  let position;
  let showCycle;
  let timer = null;

  function render() {
    const frame = trace[position];
    const prior = trace[Math.max(0, position - 1)];
    const { stages, access } = frame;
    showCycle(frame.cycle);
    byId('pipeline-cycle').textContent = 'Ciclo ' + frame.cycle + ' de ' + (trace.length - 1);
    const activities = Object.values(stages);
    const waiting = activities.filter(activity => activity.waiting).map(activity => activity.detail);
    const active = activities.filter(activity => !activity.waiting).length;
    const lines = [];
    if (frame.cycle === 0) lines.push('A primeira instrução está pronta para ser buscada.');
    if (active > 1) lines.push(active + ' estágios trabalham no mesmo ciclo.');
    lines.push(...waiting);
    if (frame.halted) {
      lines.push('CPU parada. A memória em 0x0C contém ' + frame.memory[addresses.c] + ' e o ACC contém ' + frame.acc + '.');
    }
    byId('pipeline-detail').textContent = lines.join(' ') || activities[0].detail;

    for (const node of stageNodes) {
      const activity = stages[node.dataset.pipelineStage];
      node.toggleAttribute('data-active', Boolean(activity));
      node.toggleAttribute('data-wait', Boolean(activity?.waiting));
      node.querySelector('code').textContent = activity?.instruction?.mnemonic || '—';
      node.querySelector('span').textContent = activity?.detail || 'Livre';
    }

    byId('pipeline-pc').textContent = hex(frame.pc);
    byId('pipeline-acc').textContent = frame.acc;
    byId('pipeline-value').textContent = frame.memory[addresses.c];
    const labels = { fetch: 'Busca', read: 'Leitura', write: 'Escrita' };
    byId('pipeline-port').textContent = access ? labels[access.kind] + ' em ' + hex(access.address) +
      ' · ' + (access.kind === 'fetch' ? hex(access.value) : access.value) : 'Livre';
    for (const [key, value] of Object.entries(frame.counts)) {
      const node = byId('pipeline-' + key);
      node.textContent = value;
      node.dataset.changed = value !== prior.counts[key];
    }

    previous.disabled = position === 0;
    next.disabled = frame.halted;
  }

  function pause() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    play.textContent = 'Reproduzir';
    status.setAttribute('aria-live', 'polite');
  }

  function seek(cycle) {
    pause();
    position = cycle;
    render();
  }

  function schedule() {
    timer = setTimeout(() => {
      position += 1;
      if (trace[position].halted) pause();
      render();
      if (timer !== null) schedule();
    }, 1000 / rates[Number(speed.value)]);
  }

  function speedChanged() {
    const rate = rates[Number(speed.value)];
    const caption = rate + (rate === 1 ? ' ciclo/s' : ' ciclos/s');
    byId('pipeline-rate').textContent = caption;
    speed.setAttribute('aria-valuetext', caption);
    if (timer !== null) {
      clearTimeout(timer);
      schedule();
    }
  }

  speed.oninput = speedChanged;
  previous.onclick = () => seek(position - 1);
  next.onclick = () => seek(position + 1);
  byId('pipeline-reset').onclick = () => seek(0);
  play.onclick = () => {
    if (timer !== null) {
      pause();
      return;
    }
    if (trace[position].halted) {
      position = 0;
      render();
    }
    status.setAttribute('aria-live', 'off');
    play.textContent = 'Pausar';
    schedule();
  };
  speedChanged();

  return {
    load(a, b) {
      trace = simulatePipeline(a, b);
      showCycle = createTimeline(trace, seek);
      seek(0);
    }
  };
}

init();
