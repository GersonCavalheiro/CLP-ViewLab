'use strict';

const words = [0x1a, 0x2b, 0x3c, 0x2c, 0xf0];
const addresses = { a: 0x0a, b: 0x0b, c: 0x0c };
const opcodes = { 1: 'LOAD', 2: 'ADD', 3: 'STORE', 15: 'HALT' };

function hex(value) {
  return value === null ? '—' : '0x' + value.toString(16).toUpperCase().padStart(2, '0');
}

function decode(word) {
  const opcode = word >>> 4;
  const operand = word & 15;
  const name = opcodes[opcode];
  const mnemonic = opcode === 15 ? name : name + ' [' + hex(operand) + ']';
  return { opcode, operand, name, mnemonic };
}

function initialMemory(a, b) {
  if (![a, b].every(value => Number.isInteger(value) && value >= 0 && value <= 255)) {
    throw new RangeError('Os dados devem ser valores inteiros de 0 a 255.');
  }

  const memory = Array(16).fill(0);
  memory.splice(0, words.length, ...words);
  memory[addresses.a] = a;
  memory[addresses.b] = b;
  return memory;
}

function simulateVonNeumann(a, b) {
  const memory = initialMemory(a, b);
  const registers = { pc: 0, ri: null, acc: 0, mar: null, mdr: null };
  const counts = { instructions: 0, fetches: 0, reads: 0, writes: 0 };
  const frames = [];
  let instructionAddress = null;
  let phase = null;

  function record(title, detail, activity = {}) {
    frames.push({
      title, detail, phase, instructionAddress,
      registers: { ...registers }, memory: memory.slice(), counts: { ...counts },
      ...activity
    });
  }

  function finish(title, detail, activity) {
    counts.instructions += 1;
    record(title, detail, { ...activity, complete: true });
  }

  function addressBus(control) {
    return { direction: 'to-memory', value: hex(registers.mar), control };
  }

  function dataBus(direction, control) {
    return { direction, value: hex(registers.mdr), control };
  }

  record('Pronto para buscar', 'O PC aponta para 0x00. A memória contém o programa e seus dados.');

  while (true) {
    instructionAddress = registers.pc;
    phase = 'fetch';
    registers.mar = registers.pc;
    record('Buscar o endereço do PC', 'O endereço do PC passa ao MAR e segue para a memória.', {
      selected: registers.mar, access: 'address',
      addressBus: addressBus('Leitura de instrução')
    });

    registers.mdr = memory[registers.mar];
    counts.fetches += 1;
    record('Ler a palavra da instrução', 'A memória envia ' + hex(registers.mdr) + ' ao MDR.', {
      selected: registers.mar, access: 'read',
      addressBus: addressBus('Leitura de instrução'),
      dataBus: dataBus('to-cpu', 'Leitura de instrução')
    });

    registers.ri = registers.mdr;
    registers.pc = (registers.pc + 1) & 15;
    record('Carregar o RI e avançar o PC',
      'O RI recebe a palavra buscada. O PC aponta para ' + hex(registers.pc) + '. A CPU aguarda o término da instrução atual para fazer outra busca.');

    phase = 'decode';
    const { opcode, operand, mnemonic } = decode(registers.ri);
    const detail = opcode === 15
      ? 'A unidade de controle reconhece HALT e prepara a parada.'
      : 'A unidade de controle interpreta os quatro bits altos como operação e os quatro baixos como endereço.';
    record('Decodificar ' + mnemonic, detail);

    phase = 'execute';
    if (opcode === 15) {
      finish('CPU parada', 'O resultado gravado em ' + hex(addresses.c) + ' é ' + memory[addresses.c] +
        '. O acumulador contém ' + registers.acc + ' após ler esse resultado.',
      { halted: true });
      break;
    }

    registers.mar = operand;
    if (opcode === 3) {
      registers.mdr = registers.acc;
      record('Preparar a escrita', 'O endereço entra no MAR e o valor ' + registers.acc + ' passa do ACC ao MDR.', {
        selected: operand, access: 'address',
        addressBus: addressBus('Escrita de dados')
      });

      memory[operand] = registers.mdr;
      counts.writes += 1;
      finish('STORE grava ' + registers.mdr, 'A escrita em ' + hex(operand) +
        ' foi concluída. O ADD seguinte vai ler o valor que ficou nesse endereço.', {
        selected: operand, access: 'write',
        addressBus: addressBus('Escrita de dados'),
        dataBus: dataBus('to-memory', 'Escrita de dados')
      });
      continue;
    }

    record('Endereçar o operando', 'O endereço decodificado ' + hex(operand) + ' entra no MAR e segue para a memória.', {
      selected: operand, access: 'address',
      addressBus: addressBus('Leitura de dados')
    });
    registers.mdr = memory[operand];
    counts.reads += 1;
    const dependency = opcode === 2 && operand === addresses.c;
    const readDetail = dependency
      ? 'A leitura recebe ' + registers.mdr + ', o valor escrito pelo STORE anterior no mesmo endereço. Essa é a dependência RAW.'
      : 'A memória envia o valor ' + registers.mdr + ' ao MDR.';
    record('Ler ' + hex(operand), readDetail, {
      selected: operand, access: 'read',
      addressBus: addressBus('Leitura de dados'),
      dataBus: dataBus('to-cpu', 'Leitura de dados'),
      dependency
    });

    if (opcode === 1) {
      registers.acc = registers.mdr;
      finish('LOAD atualiza o acumulador', 'O ACC recebe ' + registers.acc + '. A CPU está pronta para buscar a próxima instrução.');
    } else {
      const before = registers.acc;
      const sum = before + registers.mdr;
      registers.acc = sum & 255;
      const calculation = before + ' + ' + registers.mdr + ' resulta em ' + registers.acc;
      finish('ADD atualiza o acumulador', calculation +
        (sum > 255 ? ' em 8 bits, módulo 256.' : '.') +
        ' A ULA grava o resultado no ACC.', { dependency, alu: before + ' + ' + registers.mdr + ' → ' + registers.acc });
    }
  }
  return frames;
}
