'use strict';

const initialValue = 41;
const controller = 'Controlador';
const l1 = index => 'L1D ' + index;
const instructionNames = {
  atomic: 'lock xadd [rdi], eax',
  load: 'mov eax, [rdi]',
  add: 'add eax, 1',
  store: 'mov [rdi], eax'
};
const atomicProgram = ['atomic'];
const splitProgram = ['load', 'add', 'store'];

function simulateExecution(programs, starts, firstCore = 0) {
  const initialCores = programs.map(program => ({
    eax: program[0] === 'atomic' ? 1 : null,
    cache: 'S',
    data: initialValue,
    completed: 0
  }));
  const cpus = initialCores.map(core => ({ ...core }));
  const machine = { cores: cpus, counter: initialValue, backing: initialValue };
  const tracks = [
    { label: 'Núcleo 0', intervals: [] },
    { label: 'Núcleo 1', intervals: [] },
    { label: 'Interconexão', intervals: [] },
    { label: 'Controlador', intervals: [] }
  ];
  const network = tracks[2].intervals;
  const directory = tracks[3].intervals;
  const jobs = [];
  const waiting = [];
  const snapshots = [{ time: 0, machine: { ...machine, cores: initialCores }, waiting: [],
    caption: ['Linha inicialmente compartilhada', 'Os dois L1D têm uma cópia com 41.'] }];
  let pending;
  let caption = ['Linha inicialmente compartilhada', 'As duas cópias da linha contêm o valor 41.'];

  function note(title, explanation) {
    caption = [title, explanation];
  }

  function later(at, run) {
    jobs.push({ at, run });
  }

  function span(track, start, end, label, kind, signals) {
    if (start < end) track.push({ start, end, label, kind, signals });
  }

  function coreSpan(index, start, end, label, kind, signals) {
    span(tracks[index].intervals, start, end, label, kind, signals);
  }

  function directorySpan(start, end, label, decision) {
    span(directory, start, end, label, 'coherence', { decision });
  }

  function send(start, from, to, name, onArrival) {
    const end = start + 1;
    span(network, start, end, name, 'coherence', { from, to, name });
    if (onArrival) later(end, () => onArrival(end));
  }

  function nextInstruction(index, now) {
    const opcode = programs[index][cpus[index].completed];
    if (!opcode) return;
    const instruction = instructionNames[opcode];
    coreSpan(index, now, now + 1, 'Decodificar', 'control', {
      decode: instruction, dispatch: ['down', 'Instrução decodificada']
    });
    later(now + 1, () => execute(index, opcode, now + 1));
  }

  function complete(index, now) {
    cpus[index].completed += 1;
    nextInstruction(index, now);
  }

  function execute(index, opcode, now) {
    const core = cpus[index];

    if (opcode === 'add') {
      const old = core.eax;
      const value = old + 1;
      coreSpan(index, now, now + 2, 'Somar 1', 'data', {
        register: true, local: ['roundtrip', 'EAX'], alu: old + ' + 1 = ' + value
      });
      later(now + 2, () => {
        core.eax = value;
        note('Soma local no núcleo ' + index, 'A ULA atualiza EAX para ' + value + '. O contador em 0x1000 ainda vale ' + machine.counter + '.');
        complete(index, now + 2);
      });
      return;
    }

    if (opcode === 'load' && core.cache !== 'I') {
      const value = core.data;
      coreSpan(index, now, now + 2, 'Ler ' + value, 'data', {
        register: true, operands: ['up', value + ' para EAX'], lsu: 'Ler L1D',
        cache: true, cacheRoute: ['up', String(value)]
      });
      later(now + 2, () => {
        core.eax = value;
        note('Leitura local no núcleo ' + index, 'O núcleo guarda ' + value + ' em EAX. A cópia no registrador fica disponível mesmo se a linha for invalidada depois.');
        complete(index, now + 2);
      });
      return;
    }

    const name = opcode === 'load' ? 'GetS' : { S: 'Upgrade', I: 'GetM' }[core.cache];
    const request = { index, opcode, issued: now, name };
    if (name) {
      if (pending) {
        note('O núcleo ' + index + ' envia ' + name,
          'A interconexão transporta o pedido enquanto o núcleo ' + pending.index + ' ainda tem uma transação sobre a mesma linha.');
      }
      send(now, l1(index), controller, name, time => enqueue(request, time));
    } else {
      enqueue(request, now);
    }
  }

  function enqueue(request, now) {
    waiting.push(request);
    if (pending) {
      note('Um pedido entra na fila da linha', 'O núcleo ' + request.index + ' já iniciou seu acesso. O atendimento aguarda a transação do núcleo ' + pending.index + ' sobre o mesmo endereço.');
    }
    service(now);
  }

  function service(now) {
    if (pending || waiting.length === 0) return;
    pending = waiting.shift();
    const { index, opcode, issued, name } = pending;
    const core = cpus[index];
    const peer = 1 - index;

    if (opcode === 'load') {
      transfer(index, now, false, finishRead);
    } else if (core.cache === 'I') {
      if (name === 'Upgrade') {
        directorySpan(now, now + 2, 'Refazer pedido', 'A cópia foi invalidada. O pedido agora precisa trazer os dados.');
        send(now, controller, l1(index), 'Retry', time => {
          send(time, l1(index), controller, 'GetM', reissue => transfer(index, reissue, true, write));
        });
      } else {
        transfer(index, now, true, write);
      }
    } else if (cpus[peer].cache === 'S') {
      directorySpan(now, now + 3, 'Invalidar e conceder', 'O controlador aguarda a confirmação da outra cópia antes de conceder escrita.');
      note('O núcleo ' + index + ' pede exclusividade', 'O controlador encontra outra cópia compartilhada e envia uma invalidação.');
      send(now, controller, l1(peer), 'Inv', time => {
        cpus[peer].cache = 'I';
        cpus[peer].data = null;
        note('O L1D ' + peer + ' confirma a invalidação', 'O controlador espera a confirmação para conceder a permissão de escrita.');
        send(time, l1(peer), controller, 'InvAck', ack => {
          note('O controlador envia a permissão de escrita', 'A confirmação chegou. GrantW segue para o L1D ' + index + '.');
          send(ack, controller, l1(index), 'GrantW', grant => {
            core.cache = 'E';
            write(grant, issued);
          });
        });
      });
    } else {
      write(now, issued);
    }
  }

  function transfer(index, now, forWrite, accept) {
    const peer = 1 - index;
    const owner = cpus[peer];
    const target = cpus[index];
    const value = owner.data;
    const needsWriteback = owner.cache === 'M' && !forWrite;
    const label = forWrite ? 'Transferir exclusividade' : 'Compartilhar a linha';
    const decision = forWrite ? 'O dono fornece os dados e transfere a permissão de escrita.' : 'O dono fornece o valor atualizado ao leitor.';
    directorySpan(now, now + (forWrite ? 3 : 2), label, decision);
    note(label, 'O diretório encaminha o pedido ao L1D ' + peer + ', que contém ' + value + '.');
    send(now, controller, l1(peer), forWrite ? 'FwdGetM' : 'FwdGetS', time => {
      send(time, l1(peer), l1(index), 'Data (' + value + ')', delivery => {
        if (forWrite) {
          send(delivery, controller, l1(index), 'GrantW', grant => {
            target.data = value;
            target.cache = owner.cache;
            owner.cache = 'I';
            owner.data = null;
            accept(grant, pending.issued);
          });
        } else {
          target.data = value;
          target.cache = 'S';
          owner.cache = 'S';
          if (needsWriteback) machine.backing = value;
          accept(delivery, pending.issued);
        }
      });
      if (forWrite) send(time, l1(peer), controller, 'Cessão');
      if (needsWriteback) send(time, l1(peer), controller, 'Writeback (' + value + ')');
    });
  }

  function finishRead(now, issued) {
    const { index } = pending;
    const core = cpus[index];
    const read = core.data;
    coreSpan(index, issued, now, 'Aguardar a linha', 'wait', { lsu: 'Leitura pendente' });
    coreSpan(index, now, now + 1, 'Receber ' + read, 'data', {
      register: true, operands: ['up', read + ' para EAX'], lsu: 'Leitura concluída', cache: true
    });
    core.eax = read;
    note('O núcleo ' + index + ' recebe ' + read, 'O outro cache fornece o valor atualizado. Os dois L1D passam a compartilhar a linha.');
    pending = undefined;
    service(now);
    later(now + 1, () => complete(index, now + 1));
  }

  function write(now, issued) {
    const { index, opcode } = pending;
    const core = cpus[index];
    const atomic = opcode === 'atomic';
    const old = core.data;
    const value = atomic ? old + core.eax : core.eax;
    const storeAt = atomic ? now + 3 : now;
    const committed = storeAt + 2;
    coreSpan(index, issued, now, 'Aguardar escrita', 'wait', { lsu: 'Aguardar permissão de escrita' });

    if (atomic) {
      coreSpan(index, now, storeAt, 'Ler ' + old + ' e somar', 'data', {
        register: true, local: ['across', String(core.eax)], alu: old + ' + ' + core.eax + ' = ' + value,
        operands: ['up', old + ' para a ULA'], lsu: 'Ler com exclusividade', cache: true,
        cacheRoute: ['up', String(old)]
      });
      directorySpan(now, committed, 'Linha reservada', 'A leitura, a soma e a escrita do LOCK XADD mantêm a mesma permissão exclusiva.');
      note('O núcleo ' + index + ' lê ' + old + ' e soma 1', 'O resultado ' + value + ' fica no caminho de dados até a escrita na linha.');
    }

    coreSpan(index, storeAt, committed, 'Gravar ' + value, 'data', {
      register: true, operands: ['down', value + ' para escrita'],
      lsu: 'Gravar a linha', cache: true, cacheRoute: ['down', String(value)]
    });
    later(committed, () => {
      core.data = value;
      core.cache = 'M';
      machine.counter = value;
      if (atomic) core.eax = old;
      const detail = atomic ? 'O contador recebe ' + value + ' e EAX recebe o valor anterior, ' + old + '.'
        : 'O contador recebe ' + value + ', que já estava em EAX.';
      note('O núcleo ' + index + ' grava ' + value, detail);
      pending = undefined;
      complete(index, committed);
      service(committed);
    });
  }

  nextInstruction(firstCore, starts[firstCore]);
  nextInstruction(1 - firstCore, starts[1 - firstCore]);
  while (jobs.length) {
    jobs.sort((a, b) => a.at - b.at);
    const now = jobs[0].at;
    do {
      jobs.shift().run();
    } while (jobs[0]?.at === now);
    snapshots.push({
      time: now,
      machine: { ...machine, cores: cpus.map(core => ({ ...core })) },
      waiting: waiting.map(({ index }) => index),
      caption
    });
  }
  const last = snapshots.at(-1);
  const bothIncrement = programs.every(program => program.includes('atomic') || program.includes('store'));
  const outcome = bothIncrement
    ? last.machine.counter === 43 ? 'Os dois incrementos chegaram ao contador.' : 'Um incremento se perdeu: os dois núcleos calcularam 42 a partir de 41.'
    : 'O primeiro núcleo somou 1 e o outro recebeu o valor atualizado.';
  last.caption = [
    'Valor final em 0x1000: ' + last.machine.counter,
    outcome + ' EAX do núcleo 0: ' + last.machine.cores[0].eax + '. EAX do núcleo 1: ' + last.machine.cores[1].eax + '.'
  ];
  return { tracks, snapshots, duration: last.time };
}
