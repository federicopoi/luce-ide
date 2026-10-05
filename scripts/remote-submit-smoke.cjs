const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const {resolveEnvironment} = require('../src/main/environment.cjs');
const {Accounts} = require('../src/main/accounts.cjs');
const {TerminalManager} = require('../src/main/terminals.cjs');
const {ApprovalService} = require('../src/main/remote-approvals.cjs');
const {RemoteActions} = require('../src/main/remote-actions.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'luce-remote-submit-'));
let terminals;
let approvals;
async function until(check, label) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (check()) return;
    const session = terminals?.list().find(item => item.provider === 'codex');
    if (session && session.status !== 'running') throw Error(`Codex exited before ${label}.`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw Error(`Timed out waiting for ${label}.`);
}

(async () => {
  try {
    const environment = await resolveEnvironment();
    const codex = environment.executables.codex;
    if (!codex) throw Error('Codex CLI was not found.');
    const version = execFileSync(codex, ['--version'], {encoding: 'utf8'}).trim();
    assert.match(version, /^codex-cli \d+\.\d+\.\d+/);
    environment.env.CODEX_HOME = path.join(os.homedir(), '.codex');
    const accounts = new Accounts({directory: path.join(root, 'profile'), env: environment.env});
    approvals = new ApprovalService({directory: path.join(root, 'profile')});
    await approvals.start();
    terminals = new TerminalManager({...environment, accounts, approvalBridge: approvals});
    const project = {id: 'submit-smoke', name: 'Luce submit smoke', directory: process.cwd()};
    const created = terminals.create(project, {provider: 'codex', accountId: 'default'});
    const terminalWrites = [];
    const write = terminals.write.bind(terminals);
    terminals.write = (id, data) => { terminalWrites.push(data); return write(id, data); };
    const actions = new RemoteActions({
      snapshot: () => ({projects: [project], terminals: terminals.list(), accounts: accounts.list(), providers: {}}),
      terminals,
      approvals,
      preview: {},
      push: {},
      create: async () => {},
    });
    const buffer = () => terminals.get(created.id).buffer
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
    await until(() => buffer().includes(path.basename(project.directory)) && /\bdefault\b/.test(buffer()), 'Codex status line');
    await new Promise(resolve => setTimeout(resolve, 400));
    await actions.execute('submit', {id: created.id, data: '/status'});
    await until(() => buffer().includes('Model provider:'), 'Codex /status output');
    assert.deepEqual(terminalWrites, ['/status', '\r'], 'one submit must write the local command and exactly one Enter');
    console.log(`PASS: ${version} submitted /status through the production terminal wrapper without model inference.`);
  } finally {
    await terminals?.dispose();
    await approvals?.close();
    fs.rmSync(root, {recursive: true, force: true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
