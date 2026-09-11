// The nest: reward tokens, restreaming, funders, stranded birds.
//
// Two multi-step flows live here, and both are shown as their preconditions
// rather than as a button that reverts.

import { useEffect, useState } from 'react';
import { Note, Tag } from '../Primitives';
import {
  ActionButton, Control, Field, Problem, isAddressish, seconds, useAdminActions, whole,
} from './Bits';
import { formatCount, formatReward, parseAvians } from '../../lib/format';
import {
  addRewardToken, allowanceOf, approveForProbe, balanceOfToken, restream,
  retireRewardToken, rescueUnstaked, setFunder,
  type AdminState, type Address, type Amount,
} from '../../mock';
import s from '../../screens/Admin.module.css';

export function Nest({ admin }: { admin: AdminState }) {
  const n = admin.nest;
  const actions = useAdminActions();
  const now = Math.floor(Date.now() / 1000);

  return (
    <section aria-labelledby="nest-h">
      <h3 id="nest-h" style={{ fontSize: 20 }}>The nest</h3>
      <p className="small dim" style={{ marginTop: 8 }}>
        What streams to the birds, and on what schedule.
      </p>

      <Control
        title="Reward tokens"
        now={n.snapshotCount === null
          ? `${n.rewards.length} listed · cap ${n.maxRewardTokens}`
          : `${n.snapshotCount} of ${n.maxRewardTokens} ever listed`}
        note={n.snapshotCount === null
          ? 'The number the cap counts could not be read — it comes from simulating claimAll, which needs a connected account. It is not zero; it is unknown.'
          : 'The cap counts every token ever listed, not the live list: re-listing one that was retired is free, a new one is not.'}
      >
        <div className="scroll-x" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Token</th>
                <th className="right">Escrowed</th>
                <th className="right">Held</th>
                <th className="right">Surplus</th>
                <th>Streams until</th>
                <th className="right" />
              </tr>
            </thead>
            <tbody>
              {n.rewards.map((r) => (
                <tr key={r.token.address}>
                  <td>{r.token.symbol}</td>
                  <td className="num">{formatReward(r.escrowed, r.token.decimals)}</td>
                  <td className="num">{formatReward(r.held, r.token.decimals)}</td>
                  <td className="num">{formatReward(r.surplus, r.token.decimals)}</td>
                  <td className="mono" style={{ fontSize: 12.5 }}>
                    {r.periodFinish <= now ? 'finished' : `in ${seconds(r.periodFinish - now)}`}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <ActionButton
                      ghost
                      actions={actions}
                      action={{
                        key: `retire:${r.token.address}`,
                        label: 'Retire',
                        disabled: !r.listed,
                        run: (on) => retireRewardToken(r.token.address, on),
                        outcome: () => `${r.token.symbol} retired. Anyone still owed in it can claim it.`,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny dim" style={{ marginTop: 10 }}>
          Escrowed is promised to stakers and untouchable. Held is what the contract actually has.
          The difference is the only thing a restream can re-schedule.
        </p>
      </Control>

      <AddReward admin={admin} actions={actions} />
      <Restream admin={admin} actions={actions} />
      <Funders actions={actions} />
      <Stranded actions={actions} />

      {actions.confirmDialog}
    </section>
  );
}

// ── adding one: two transactions, shown as two ────────────────────────────

function AddReward({
  admin, actions,
}: { admin: AdminState; actions: ReturnType<typeof useAdminActions> }) {
  const [token, setToken] = useState('');
  const [probe, setProbe] = useState('');
  const [state, setState] = useState<{ balance: Amount; allowance: Amount } | null>(null);
  const [failed, setFailed] = useState(false);

  let amount: Amount | null = null;
  try { amount = probe.trim() === '' ? null : parseAvians(probe); } catch { amount = null; }

  const valid = isAddressish(token);
  const who = admin.you;

  useEffect(() => {
    let alive = true;
    setState(null);
    setFailed(false);
    if (!valid || !who) return () => { alive = false; };
    const spender = admin.ownership.find((o) => o.contract === 'TheNest')!.address;
    Promise.all([
      balanceOfToken(token.trim() as Address, who),
      allowanceOf(token.trim() as Address, who, spender),
    ]).then(
      ([balance, allowance]) => { if (alive) setState({ balance, allowance }); },
      () => { if (alive) setFailed(true); },
    );
    return () => { alive = false; };
  }, [token, valid, who, admin.ownership]);

  const already = admin.nest.rewards.some(
    (r) => r.token.address.toLowerCase() === token.trim().toLowerCase(),
  );
  const capReached = admin.nest.snapshotCount !== null
    && admin.nest.snapshotCount >= admin.nest.maxRewardTokens;
  const approved = !!state && amount !== null && state.allowance >= amount;
  const funded = !!state && amount !== null && state.balance >= amount;

  return (
    <Control
      title="Add a reward token"
      note={<>
        The contract pulls <span className="mono">probeAmount</span> in from your wallet and sends it
        straight back, and refuses the token if the balance does not change by exactly that. It is
        a real transfer, so it needs a real allowance first — for exactly that amount and no more.
      </>}
    >
      <div className={s.form}>
        <Field
          label="Token"
          value={token}
          placeholder="0x…"
          invalid={token !== '' && !valid}
          onChange={setToken}
        />
        <Field
          label="Probe amount"
          value={probe}
          placeholder="1"
          hint="Comes back to you in the same transaction."
          invalid={probe !== '' && amount === null}
          onChange={setProbe}
        />
      </div>

      {failed ? (
        <Problem>That token could not be read. Not "there is none" — we could not ask.</Problem>
      ) : null}

      {already ? <Problem>That token is already listed. Retire it first to re-list it.</Problem> : null}
      {capReached && !already ? (
        <Problem>
          The list is full at {admin.nest.maxRewardTokens}. Only a token that has been listed before
          can be added now.
        </Problem>
      ) : null}

      {state && amount !== null ? (
        <div className="row row--wrap" style={{ gap: 10, marginTop: 12 }}>
          <Tag tone={funded ? 'ok' : 'bad'}>
            {funded ? 'You hold enough' : 'Not enough in your wallet'}
          </Tag>
          <Tag tone={approved ? 'ok' : 'warn'}>
            {approved ? 'Approved' : 'Needs an approval'}
          </Tag>
        </div>
      ) : null}

      <div className={s.form}>
        <ActionButton
          ghost
          actions={actions}
          action={{
            key: 'probe-approve',
            label: 'Step 1 · approve the probe',
            disabled: !valid || amount === null || approved,
            run: (on) => approveForProbe(token.trim() as Address, amount!, on),
            outcome: () => 'Approved, for exactly that amount.',
          }}
        />
        <ActionButton
          actions={actions}
          action={{
            key: 'add-reward',
            label: 'Step 2 · add it',
            disabled: !valid || amount === null || !approved || already,
            run: (on) => addRewardToken(token.trim() as Address, amount!, on),
            outcome: () => 'Listed. It streams as soon as something is sent to it.',
          }}
        />
      </div>
    </Control>
  );
}

// ── restreaming ───────────────────────────────────────────────────────────

function Restream({
  admin, actions,
}: { admin: AdminState; actions: ReturnType<typeof useAdminActions> }) {
  const withSurplus = admin.nest.rewards.filter((r) => r.surplus > 0n);
  const [at, setAt] = useState(0);
  const [duration, setDuration] = useState(String(admin.treasury.conversion.streamDuration));
  const chosen = withSurplus[at];
  const d = whole(duration);
  const inRange = d !== null && d >= admin.nest.minDuration && d <= admin.nest.maxDuration;
  const nothingStaked = admin.nest.totalWeight === 0n;

  return (
    <Control
      title="Restream"
      now={withSurplus.length === 0 ? 'nothing spare' : `${withSurplus.length} with a surplus`}
      note={<>
        What is already earned is settled and stays settled. Only the amount above what is escrowed
        moves — it keeps its value and changes only its timing.
      </>}
    >
      {nothingStaked ? (
        <Problem>Nothing is staked, so there is nobody to stream to and the call refuses.</Problem>
      ) : null}

      {withSurplus.length === 0 ? (
        <p className="tiny dim" style={{ marginTop: 10 }}>
          Every token the nest holds is already promised to stakers. There is nothing unscheduled to
          re-schedule.
        </p>
      ) : (
        <div className={s.form}>
          <label className={s.field}>
            <span className={s.label}>Token</span>
            <select className="select" value={at} onChange={(e) => setAt(whole(e.target.value) ?? 0)}>
              {withSurplus.map((r, i) => (
                <option key={r.token.address} value={i}>
                  {r.token.symbol} · {formatReward(r.surplus, r.token.decimals)} spare
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Duration, seconds"
            value={duration}
            hint={`${seconds(admin.nest.minDuration)} to ${seconds(admin.nest.maxDuration)}`}
            invalid={d !== null && !inRange}
            onChange={setDuration}
          />
          <ActionButton
            actions={actions}
            action={{
              key: 'restream',
              label: 'Restream it',
              disabled: !chosen || !inRange || nothingStaked,
              run: (on) => restream(chosen.token.address, d!, on),
              outcome: (r) => `${formatReward((r as { amount: Amount }).amount, chosen.token.decimals)} ${chosen.token.symbol} re-scheduled over ${seconds(d!)}.`,
            }}
          />
        </div>
      )}
    </Control>
  );
}

// ── funders and stranded birds ────────────────────────────────────────────

function Funders({ actions }: { actions: ReturnType<typeof useAdminActions> }) {
  const [who, setWho] = useState('');
  const valid = isAddressish(who);

  return (
    <Control
      title="Funders"
      note={<>
        A funder may call <span className="mono">notifyRewardAmount</span> — start a stream — without
        being the owner. The Treasury is one. That call is not on this panel: it needs an approval
        and an amount, and it is the Treasury&rsquo;s automated path rather than an owner&rsquo;s.
      </>}
    >
      <div className={s.form}>
        <Field
          label="Address"
          value={who}
          placeholder="0x…"
          invalid={who !== '' && !valid}
          onChange={setWho}
        />
        <ActionButton
          actions={actions}
          action={{
            key: 'funder-add',
            label: 'Allow',
            disabled: !valid,
            run: (on) => setFunder(who.trim() as Address, true, on),
            outcome: () => 'Allowed.',
          }}
        />
        <ActionButton
          ghost
          actions={actions}
          action={{
            key: 'funder-remove',
            label: 'Disallow',
            disabled: !valid,
            run: (on) => setFunder(who.trim() as Address, false, on),
            outcome: () => 'Disallowed.',
          }}
        />
      </div>
    </Control>
  );
}

function Stranded({ actions }: { actions: ReturnType<typeof useAdminActions> }) {
  const [id, setId] = useState('');
  const [to, setTo] = useState('');
  const tokenId = whole(id);
  const valid = isAddressish(to) && tokenId !== null;

  return (
    <Control
      title="Stranded bird"
      note={<>
        A bird the nest holds with no stake recorded against it — sent in with a plain{' '}
        <span className="mono">transferFrom</span> instead of{' '}
        <span className="mono">stake</span>, which the contract cannot credit to anyone. A bird that
        IS staked belongs to its staker and the contract refuses to move it.
      </>}
    >
      <div className={s.form}>
        <Field
          label="Bird"
          value={id}
          placeholder="1204"
          invalid={id !== '' && tokenId === null}
          hint={tokenId === null ? undefined : `Avian #${formatCount(tokenId)}`}
          onChange={setId}
        />
        <Field
          label="Send to"
          value={to}
          placeholder="0x…"
          invalid={to !== '' && !isAddressish(to)}
          onChange={setTo}
        />
        <ActionButton
          actions={actions}
          action={{
            key: 'stranded',
            label: 'Send it back',
            disabled: !valid,
            run: (on) => rescueUnstaked(tokenId!, to.trim() as Address, on),
            outcome: () => 'Sent.',
          }}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <Note tone="info">
          Check the bird really is stranded before sending it anywhere. The contract refuses a
          staked one, but it cannot tell you who the sender meant it for.
        </Note>
      </div>
    </Control>
  );
}
