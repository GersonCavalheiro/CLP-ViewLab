'use strict';

const pipelineStages = [
  { key: 'fetch', letter: 'B', label: 'Busca' },
  { key: 'decode', letter: 'D', label: 'Decodificação' },
  { key: 'execute', letter: 'E', label: 'Execução' },
  { key: 'commit', letter: 'C', label: 'Conclusão' }
];

function readsMemory(instruction) {
  return instruction.opcode === 1 || instruction.opcode === 2;
}

function dependencyFor(consumer, producer) {
  if (!producer) return '';
  if (readsMemory(producer) && (consumer.opcode === 2 || consumer.opcode === 3)) {
    return 'RAW no ACC. Aguarda o valor de ' + producer.mnemonic + '.';
  }
  if (producer.opcode === 3 && readsMemory(consumer) && producer.operand === consumer.operand) {
    return 'RAW em ' + hex(consumer.operand) + '. Aguarda a escrita de STORE.';
  }
  return '';
}

function simulatePipeline(a, b) {
  const memory = initialMemory(a, b);
  const counts = { instructions: 0, fetches: 0, reads: 0, writes: 0 };
  let pc = 0;
  let acc = 0;
  let fetchBuffer = null;
  let decoding = null;
  let executing = null;
  let completing = null;
  let halted = false;
  const frames = [];

  function capture(stages, access = null) {
    frames.push({
      cycle: frames.length, pc, acc, memory: memory.slice(), counts: { ...counts },
      stages, access, halted
    });
  }

  capture({});
  while (!halted) {
    let access = null;
    const stages = {};

    // The memory port serves an older store before an operand read or a fetch.
    if (completing?.opcode === 3) {
      access = { kind: 'write', address: completing.operand, value: completing.result };
    }
    if (completing) {
      const detail = completing.opcode === 3
        ? 'Grava ' + completing.result + ' em ' + hex(completing.operand) + '.'
        : completing.opcode === 15 ? 'Encerra o programa.' : 'Grava ' + completing.result + ' no ACC.';
      stages.commit = { instruction: completing, detail };
    }

    const executeHeld = executing && readsMemory(executing) && access;
    let nextCommit = null;
    if (executing) {
      if (executeHeld) {
        stages.execute = { instruction: executing, waiting: true, detail: 'A escrita mais antiga ocupa a porta de memória.' };
      } else {
        let result = null;
        let detail = 'Sinal de parada preparado.';
        if (readsMemory(executing)) {
          const operandValue = memory[executing.operand];
          access = { kind: 'read', address: executing.operand, value: operandValue };
          counts.reads += 1;
          result = executing.opcode === 1 ? operandValue : (acc + operandValue) & 255;
          detail = executing.opcode === 1
            ? 'Lê ' + operandValue + ' para o ACC.'
            : 'Lê ' + operandValue + ' em ' + hex(executing.operand) + '. ULA calcula ' + acc + ' + ' + operandValue + ' → ' + result + '.';
        } else if (executing.opcode === 3) {
          result = acc;
          detail = 'Prepara ' + result + ' para escrita em ' + hex(executing.operand) + '.';
        }
        nextCommit = { ...executing, result };
        stages.execute = { instruction: executing, detail };
      }
    }

    // Execution reads the architectural values from the start of a cycle.
    // A producer in C commits before a consumer enters E in the next cycle.
    let nextExecute = executeHeld ? executing : null;
    let nextDecode = decoding;
    if (decoding) {
      const reason = dependencyFor(decoding, executing) ||
        (executeHeld ? 'A execução continua ocupada.' : '');
      stages.decode = { instruction: decoding, waiting: Boolean(reason),
        detail: reason || 'Identifica a operação para o próximo ciclo.' };
      if (!reason) {
        nextExecute = decoding;
        nextDecode = null;
      }
    }

    if (fetchBuffer) {
      stages.fetch = { instruction: fetchBuffer, waiting: true,
        detail: nextDecode ? 'Palavra no buffer. Aguarda espaço na decodificação.' : 'Palavra no buffer. Avança no fim do ciclo.' };
      if (!nextDecode) {
        nextDecode = fetchBuffer;
        fetchBuffer = null;
      }
    } else if (pc < words.length) {
      if (access) {
        stages.fetch = { waiting: true, detail: 'Porta de memória ocupada por um acesso a dados.' };
      } else {
        const word = memory[pc];
        const instruction = { ...decode(word), address: pc };
        access = { kind: 'fetch', address: pc, value: word };
        counts.fetches += 1;
        pc += 1;
        stages.fetch = { instruction, detail: 'Busca ' + hex(word) + ' em ' + hex(instruction.address) + '.' };
        if (nextDecode) fetchBuffer = instruction;
        else nextDecode = instruction;
      }
    }

    if (completing) {
      counts.instructions += 1;
      if (completing.opcode === 3) {
        memory[completing.operand] = completing.result;
        counts.writes += 1;
      } else if (completing.opcode === 15) {
        halted = true;
      } else {
        acc = completing.result;
      }
    }
    capture(stages, access);
    decoding = nextDecode;
    executing = nextExecute;
    completing = nextCommit;
  }

  return frames;
}
