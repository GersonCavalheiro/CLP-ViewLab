'use strict';

const size = 1024;
const factor = 2.5;
const rates = [1, 3, 8, 12, 18, 24, 36, 48];
const formatter = new Intl.NumberFormat('pt-BR', { useGrouping: true, maximumFractionDigits: 2 });
const format = number => number === null ? '—' : formatter.format(number);
const byId = id => document.getElementById(id);

function programFor(mode) {
  const vector = mode === 'vector';
  const width = vector ? 4 : 1;
  const resultRegister = vector ? 'ymm0' : 'xmm0';
  const factorRegister = vector ? 'ymm1' : 'xmm1';
  const move = vector ? 'vmovupd' : 'movsd';
  const memoryOperand = '[rsi + rax*8]';
  const program = [
    {
      phase: 'setup', text: 'xor eax, eax',
      execute(state) {
        state.index = 0;
        return ['Preparar o índice', 'XOR zera EAX. Em x86-64, isso também zera RAX, que passa a indicar o primeiro elemento.'];
      }
    },
    {
      phase: 'factor',
      text: (vector ? 'vbroadcastsd ' : 'movsd ') + factorRegister + ', [rel escala]',
      execute(state) {
        state.scale = Array(width).fill(factor);
        return vector
          ? ['Replicar o fator', 'VBROADCASTSD lê 2,5 da memória e replica o valor nas quatro posições de YMM1.']
          : ['Carregar o fator', 'MOVSD carrega 2,5 na posição baixa de XMM1.'];
      }
    },
    {
      label: '.laco:', phase: 'load', text: `${move} ${resultRegister}, ${memoryOperand}`,
      execute(state) {
        state.window = state.index;
        state.data = state.input.slice(state.index, state.index + width);
        const detail = vector ? 'Quatro doubles consecutivos entram em YMM0.' : 'Um double entra na posição baixa de XMM0.';
        return ['Ler a entrada', detail];
      }
    },
    {
      phase: 'multiply',
      text: vector ? 'vmulpd ymm0, ymm0, ymm1' : 'mulsd xmm0, xmm1',
      execute(state) {
        state.data = state.data.map((value, lane) => value * state.scale[lane]);
        const detail = vector
          ? 'VMULPD multiplica as quatro posições correspondentes de YMM0 e YMM1 e devolve os quatro produtos a YMM0.'
          : 'MULSD multiplica as posições baixas de XMM0 e XMM1 e guarda o produto em XMM0.';
        return ['Multiplicar pelo fator', detail];
      }
    },
    {
      phase: 'store', text: `${move} [rdi + rax*8], ${resultRegister}`,
      execute(state) {
        state.output.splice(state.index, width, ...state.data);
        state.written += width;
        const detail = vector
          ? 'VMOVUPD grava os quatro produtos consecutivos na saída.'
          : 'MOVSD grava o produto na posição indicada pelo índice.';
        return ['Gravar na saída', detail];
      }
    },
    {
      phase: 'index', text: 'add rax, ' + width,
      execute(state) {
        state.index += width;
        return ['Avançar o índice', 'RAX agora vale ' + format(state.index) + ' após o avanço de ' + width + '.'];
      }
    },
    {
      phase: 'compare', text: 'cmp rax, ' + size,
      execute(state) {
        state.belowLimit = state.index < size;
        return ['Comparar com o limite', 'CMP ajusta os indicadores usados pelo salto. O índice ' +
          (state.belowLimit ? 'ainda é menor que ' : 'atingiu ') + format(size) + '.'];
      }
    },
    {
      phase: 'branch', text: 'jb .laco',
      execute(state) {
        state.iterations += 1;
        if (state.belowLimit) {
          state.pc = loopStart;
          return ['Repetir o laço', 'JB salta para .laco porque o índice ainda está abaixo do limite.'];
        }
        return ['Execução concluída', 'JB é executado pela última vez e segue em frente. Os ' +
          format(state.written) + ' produtos foram gravados na saída.'];
      }
    }
  ];
  const loopStart = program.findIndex(instruction => instruction.label);
  return { width, resultRegister, factorRegister, program };
}

function initialState() {
  return {
    index: null,
    window: 0,
    input: Array.from({ length: size }, (_, index) => index + 1),
    output: Array(size).fill(null),
    data: [],
    scale: [],
    belowLimit: false,
    pc: 0,
    executed: 0,
    iterations: 0,
    written: 0,
    last: null,
    message: ['Pronto para executar', 'A entrada começa em 1 e aumenta de 1 em 1. A saída será preenchida durante a execução.']
  };
}

function executeInstruction(state, program) {
  const instruction = program[state.pc];
  if (!instruction) return false;
  state.last = state.pc;
  state.pc += 1;
  state.executed += 1;
  state.message = instruction.execute(state);
  return true;
}

function createListing(program) {
  const output = byId('assembly');
  return program.map(instruction => {
    if (instruction.label) {
      const label = document.createElement('span');
      label.className = 'asm-label';
      label.textContent = instruction.label;
      output.append(label, '\n');
    }
    const line = document.createElement('span');
    line.className = 'asm-line';
    line.textContent = '    ' + instruction.text;
    output.append(line, '\n');
    return line;
  });
}

function createFlow({ width, resultRegister, factorRegister }) {
  const flow = byId('flow');
  flow.style.setProperty('--width', width);
  const registerNote = width === 1 ? 'Posição baixa · 64 bits' : 'Quatro posições · 256 bits';
  const group = (key, name, note) => `
    <div class="flow-group" data-row="${key}">
      <div class="row-label"><strong>${name}</strong><span>${note}</span></div>
      <div class="slots">
        ${Array.from({ length: width }, () => '<div class="slot"><small></small><strong>—</strong></div>').join('')}
      </div>
    </div>`;

  flow.innerHTML = `
    ${group('input', 'Entrada', 'Memória · RSI')}
    <div class="flow-link" id="load-path" aria-hidden="true"><span>↓</span></div>
    <div class="registers">
      ${group('register', resultRegister.toUpperCase(), registerNote)}
      ${group('factor', factorRegister.toUpperCase(), 'Fator da multiplicação')}
    </div>
    <div class="flow-link" id="store-path" aria-hidden="true"><span>↓</span></div>
    ${group('output', 'Saída', 'Memória · RDI')}`;

  const rows = {};
  for (const row of flow.querySelectorAll('[data-row]')) {
    rows[row.dataset.row] = {
      group: row,
      cells: Array.from(row.querySelectorAll('.slot'), cell => ({
        label: cell.querySelector('small'), value: cell.querySelector('strong')
      }))
    };
  }

  function showRow(name, getValue, getLabel, active) {
    rows[name].group.dataset.active = active;
    rows[name].cells.forEach(({ label, value }, lane) => {
      label.textContent = getLabel(lane);
      value.textContent = format(getValue(lane) ?? null);
    });
  }

  return (state, phase) => {
    const position = lane => 'pos. ' + lane;
    const index = lane => '[' + format(state.window + lane) + ']';
    showRow('input', lane => state.input[state.window + lane], index, phase === 'load');
    showRow('register', lane => state.data[lane], position, ['load', 'multiply', 'store'].includes(phase));
    showRow('factor', lane => state.scale[lane], position, ['factor', 'multiply'].includes(phase));
    showRow('output', lane => state.output[state.window + lane], index, phase === 'store');
    byId('load-path').dataset.active = phase === 'load';
    byId('store-path').dataset.active = phase === 'store';
  };
}

function mountSimulator(configuration) {
  const { program } = configuration;
  const lines = createListing(program);
  const showFlow = createFlow(configuration);
  const play = byId('play');
  const step = byId('step');
  const finish = byId('finish');
  const speed = byId('speed');
  const status = byId('status');
  let state = initialState();
  let frame = null;
  let timeStamp = null;
  let credit = 0;
  let highlighted = null;

  function showSpeed() {
    const label = format(rates[Number(speed.value)]) + ' instruções/s';
    byId('rate').textContent = label;
    speed.setAttribute('aria-valuetext', label);
  }

  function render() {
    const phase = program[state.last]?.phase;
    const completed = state.pc === program.length;
    if (highlighted !== state.last) {
      lines[highlighted]?.removeAttribute('aria-current');
      lines[state.last]?.setAttribute('aria-current', 'step');
      highlighted = state.last;
    }
    showFlow(state, phase);

    byId('count').textContent = format(state.executed);
    byId('iterations').textContent = format(state.iterations);
    byId('written').textContent = format(state.written);
    byId('index').textContent = format(state.index);
    byId('index').dataset.active = ['setup', 'index', 'compare', 'branch'].includes(phase);
    byId('count').dataset.active = completed;
    byId('event-label').textContent = state.message[0];
    byId('event-detail').textContent = state.message[1] +
      (completed ? ' A execução totalizou ' + format(state.executed) + ' instruções.' : '');
    play.disabled = step.disabled = finish.disabled = completed;
  }

  function pause() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    timeStamp = null;
    credit = 0;
    play.textContent = 'Reproduzir';
    status.setAttribute('aria-live', 'polite');
  }

  function animate(timestamp) {
    if (timeStamp !== null) {
      credit += (timestamp - timeStamp) * rates[Number(speed.value)] / 1000;
    }
    timeStamp = timestamp;
    if (credit >= 1) {
      // Show one instruction per frame, even when the browser falls behind.
      credit %= 1;
      executeInstruction(state, program);
      const completed = state.pc === program.length;
      if (completed) pause();
      render();
      if (completed) return;
    }
    frame = requestAnimationFrame(animate);
  }

  play.onclick = () => {
    if (frame !== null) {
      pause();
      return;
    }
    play.textContent = 'Pausar';
    status.setAttribute('aria-live', 'off');
    frame = requestAnimationFrame(animate);
  };
  step.onclick = () => {
    pause();
    executeInstruction(state, program);
    render();
  };
  finish.onclick = () => {
    pause();
    while (executeInstruction(state, program)) {
      // The same interpreter runs each instruction before displaying the final state.
    }
    render();
  };
  byId('reset').onclick = () => {
    pause();
    state = initialState();
    render();
  };
  speed.oninput = showSpeed;
  showSpeed();
  render();
}

mountSimulator(programFor(document.body.dataset.mode));
