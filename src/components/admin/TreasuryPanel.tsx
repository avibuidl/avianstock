// The Treasury, from the owner's side.
//
// The withdraw control lives here rather than on the public Treasury card,
// with the `claimable` figure that labels it. And so does the AVIANS row: the
// Treasury's AVIANS position is not itemised on a public page. To be exact
// about what that means — the balance is a public fact on chain and anyone can
// read it from an explorer. Keeping it here takes it off the site, and claims
// nothing beyond that.

import { useEffect, useState } from 'react';
import { Box, Note, Tag } from '../Primitives';
import {
  ActionButton, Addr, Control, Field, Problem, ReadOnlyBlock, Toggle,
  addressList, isAddressish, seconds, useAdminActions, whole,
} from './Bits';
import { avians, formatBps, formatEth, formatReward, parseAvians } from '../../lib/format';
import {
  claimAdmin, readRoute, setConversionConfig, setFloorPrice, setKeeperDropBps,
  setPriceKeeper, setRoute, setTargets, setV3Route,
  type AdminRoute, type AdminState, type AdminTargetRow, type Address, type Amount,
  type TreasuryRow,
} from '../../mock';
import s from '../../screens/Admin.module.css';

function money(row: TreasuryRow, v: Amount): string {
  if (row.symbol === 'AVIANS') return avians(v);
  if (row.currency === null) return `${formatEth(v)} ${row.symbol}`;
  return `${formatReward(v, row.decimals)} ${row.symbol}`;
}

export function TreasuryPanel({ admin }: { admin: AdminState }) {
  const t = admin.treasury;
  const actions = useAdminActions();

  return (
    <section aria-labelledby="tre-h">
      <h3 id="tre-h" style={{ fontSize: 20 }}>The Treasury</h3>
      <p className="small dim" style={{ marginTop: 8 }}>
        Income arrives here, a share of it is the admin&rsquo;s to withdraw, and the rest is
        converted into reward tokens by anyone who presses the public button on the Contracts page.
      </p>

      <Withdraw admin={admin} actions={actions} />
      <Conversion admin={admin} actions={actions} />
      <Targets admin={admin} actions={actions} />
      <Routes admin={admin} actions={actions} />
      <Floors admin={admin} actions={actions} />

      <Control
        title="Price keeper"
        now={<Addr value={t.priceKeeper} />}
        note={<>May set floor prices, and may not drop a standing one by more than {formatBps(t.maxKeeperDropBps)}. The owner has neither limit.</>}
      >
        <KeeperForm admin={admin} actions={actions} />
      </Control>

      {actions.confirmDialog}
    </section>
  );
}

// ── withdraw ──────────────────────────────────────────────────────────────

function Withdraw({
  admin, actions,
}: { admin: AdminState; actions: ReturnType<typeof useAdminActions> }) {
  const [to, setTo] = useState('');
  const owed = admin.treasury.rows.filter((r) => r.claimable > 0n);
  const target = to.trim() || admin.you || '';
  const valid = isAddressish(target);

  return (
    <Control
      title="Withdraw the admin's share"
      now={owed.length === 0 ? 'nothing outstanding' : `${owed.length} currenc${owed.length === 1 ? 'y' : 'ies'}`}
      note={<>
        One currency, one transaction. The destination is an argument rather than the owner&rsquo;s
        own address, so a hardware wallet can hold the key while somewhere else holds the money.
      </>}
    >
      <div className={s.form}>
        <Field
          label="Send to"
          value={to}
          placeholder={admin.you ?? '0x…'}
          invalid={to !== '' && !isAddressish(to)}
          hint={to === '' ? 'Empty means the connected wallet.' : undefined}
          onChange={setTo}
        />
      </div>

      {owed.length === 0 ? (
        <p className="tiny dim" style={{ marginTop: 12 }}>
          Nothing is outstanding in any currency right now.
        </p>
      ) : (
        <div className="stack" style={{ marginTop: 12, gap: 8 }}>
          {owed.map((r) => (
            <div key={r.symbol} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <span className="strong" style={{ minWidth: 72 }}>{r.symbol}</span>
              <span className="mono tiny">{money(r, r.claimable)}</span>
              <span className="spacer" />
              <ActionButton
                actions={actions}
                action={{
                  key: `claim:${r.symbol}`,
                  label: `Withdraw ${r.symbol}`,
                  disabled: !valid,
                  run: (on) => claimAdmin(r.currency, target as Address, on),
                  outcome: (out) => `${money(r, (out as { amount: Amount }).amount)} sent.`,
                }}
              />
            </div>
          ))}
        </div>
      )}

      <div className="scroll-x" style={{ marginTop: 16 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Currency</th>
              <th className="right">Received, total</th>
              <th className="right">Balance now</th>
              <th className="right">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {admin.treasury.rows.map((r) => (
              <tr key={r.symbol}>
                <td>{r.symbol}</td>
                <td className="num">{money(r, r.cumulativeIn)}</td>
                <td className="num">{money(r, r.balance)}</td>
                <td className="num">{money(r, r.claimable)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny dim" style={{ marginTop: 10 }}>
        The public card on the Contracts page shows the first two columns, and does not list AVIANS
        at all. Every figure here is on chain and readable by anyone who looks; this is where the
        site shows them, not where they are kept secret.
      </p>
    </Control>
  );
}

// ── the conversion configuration ──────────────────────────────────────────

function Conversion({
  admin, actions,
}: { admin: AdminState; actions: ReturnType<typeof useAdminActions> }) {
  const c = admin.treasury.conversion;
  const b = admin.treasury.bounds;
  const [form, setForm] = useState(c);
  useEffect(() => { setForm(c); }, [c.enabled, c.minInterval, c.maxPerCallBps, c.slippageBps, c.streamDuration, c.maxPriceAge]); // eslint-disable-line react-hooks/exhaustive-deps

  const problems: string[] = [];
  if (form.minInterval < b.minIntervalFloor) {
    problems.push(`The interval cannot be under ${seconds(b.minIntervalFloor)} — the contract's own floor.`);
  }
  if (form.maxPerCallBps === 0 || form.maxPerCallBps > b.maxPerCallBpsCap) {
    problems.push(`Per call must be between 1 and ${b.maxPerCallBpsCap} bps.`);
  }
  if (form.slippageBps > b.slippageBpsCap) {
    problems.push(`Slippage cannot be over ${b.slippageBpsCap} bps.`);
  }
  if (form.maxPriceAge < b.minPriceAge || form.maxPriceAge > b.maxPriceAge) {
    problems.push(`Price age must be between ${seconds(b.minPriceAge)} and ${seconds(b.maxPriceAge)}.`);
  }
  if (form.streamDuration < b.minStreamDuration || form.streamDuration > b.maxStreamDuration) {
    problems.push(`The stream duration is checked against the nest's bounds: ${seconds(b.minStreamDuration)} to ${seconds(b.maxStreamDuration)}.`);
  }

  const numberField = (
    label: string, key: keyof typeof form, hint: string,
  ) => (
    <Field
      key={key}
      label={label}
      value={String(form[key] as number)}
      hint={hint}
      invalid={whole(String(form[key] as number)) === null}
      onChange={(v) => {
        const n = whole(v);
        setForm({ ...form, [key]: n === null ? 0 : n });
      }}
    />
  );

  return (
    <Control
      title="Conversion"
      now={c.enabled ? 'on' : 'off'}
      note="All six go in one call, so the form sends what is on screen — including the fields you did not touch."
    >
      <div className={s.form}>
        <Toggle label="Enabled" checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} />
        {numberField('Interval, seconds', 'minInterval', `now ${seconds(c.minInterval)} · floor ${seconds(b.minIntervalFloor)}`)}
        {numberField('Per call, bps', 'maxPerCallBps', `now ${formatBps(c.maxPerCallBps)} · cap ${b.maxPerCallBpsCap} bps`)}
        {numberField('Slippage, bps', 'slippageBps', `now ${formatBps(c.slippageBps)} · cap ${b.slippageBpsCap} bps`)}
        {numberField('Stream, seconds', 'streamDuration', `now ${seconds(c.streamDuration)}`)}
        {numberField('Price age, seconds', 'maxPriceAge', `now ${seconds(c.maxPriceAge)}`)}
      </div>
      {problems.map((p) => <Problem key={p}>{p}</Problem>)}
      <div className={s.form}>
        <ActionButton
          actions={actions}
          action={{
            key: 'conversion',
            label: 'Save the configuration',
            disabled: problems.length > 0,
            run: (on) => setConversionConfig(form, on),
            outcome: () => 'Saved.',
          }}
        />
      </div>
    </Control>
  );
}

// ── targets ───────────────────────────────────────────────────────────────

function Targets({
  admin, actions,
}: { admin: AdminState; actions: ReturnType<typeof useAdminActions> }) {
  const [rows, setRows] = useState<AdminTargetRow[]>(admin.treasury.targets);
  useEffect(() => { setRows(admin.treasury.targets); }, [admin.treasury.targets]);

  const sum = rows.reduce((n, r) => n + r.weightBps, 0);
  const listed = admin.nest.rewards.filter((r) => r.listed).map((r) => r.token);
  const problems: string[] = [];
  if (rows.length === 0) problems.push('At least one target.');
  if (rows.length > admin.treasury.bounds.maxTargets) {
    problems.push(`At most ${admin.treasury.bounds.maxTargets} targets.`);
  }
  if (sum !== 10_000) problems.push(`The weights add up to ${sum} bps. They have to be exactly 10,000.`);
  if (new Set(rows.map((r) => r.token.toLowerCase())).size !== rows.length) {
    problems.push('The same token appears twice.');
  }
  for (const r of rows) {
    if (!listed.some((l) => l.address.toLowerCase() === r.token.toLowerCase())) {
      problems.push(`${r.token} is not a listed reward token, and the Treasury will refuse it.`);
    }
  }

  return (
    <Control
      title="Conversion targets"
      now={`${admin.treasury.targets.length} · ${admin.treasury.targets.map((t) => symbolOf(admin, t.token)).join(', ') || 'none'}`}
      note="What the income is split into, and in what proportion. The weights are checked here so the contract's refusal is a shape nobody has to see."
    >
      {rows.map((r, i) => (
        <div className={s.form} key={`${r.token}:${i}`}>
          <Field
            label="Token"
            value={r.token}
            invalid={!isAddressish(r.token)}
            hint={symbolOf(admin, r.token)}
            onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, token: v as Address } : x)))}
          />
          <Field
            label="Weight, bps"
            value={String(r.weightBps)}
            hint={formatBps(r.weightBps)}
            invalid={whole(String(r.weightBps)) === null}
            onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, weightBps: whole(v) ?? 0 } : x)))}
          />
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}

      {problems.map((p) => <Problem key={p}>{p}</Problem>)}

      <div className={s.form}>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          disabled={rows.length >= admin.treasury.bounds.maxTargets}
          onClick={() => setRows([...rows, { token: '0x' as Address, weightBps: 0 }])}
        >
          Add a target
        </button>
        <ActionButton
          actions={actions}
          action={{
            key: 'targets',
            label: 'Save the targets',
            disabled: problems.length > 0,
            run: (on) => setTargets(rows, on),
            outcome: () => `${rows.length} targets set.`,
          }}
        />
      </div>
    </Control>
  );
}

function symbolOf(admin: AdminState, token: Address): string {
  const found = admin.treasury.rows.find(
    (r) => r.currency && r.currency.toLowerCase() === token.toLowerCase(),
  );
  return found?.symbol ?? '—';
}

// ── routes ────────────────────────────────────────────────────────────────

const VENUE = ['none', 'Uniswap v4', 'Uniswap v3'];

function Routes({
  admin, actions,
}: { admin: AdminState; actions: ReturnType<typeof useAdminActions> }) {
  const pairs = admin.treasury.pairs;
  const [at, setAt] = useState(0);
  const pair = pairs[at];
  const [route, setRouteState] = useState<AdminRoute | null>(null);
  const [v4, setV4] = useState('');
  const [v3, setV3] = useState('');

  useEffect(() => {
    let alive = true;
    setRouteState(null);
    if (!pair) return () => { alive = false; };
    readRoute(pair.currency, pair.target).then(
      (r) => { if (alive) { setRouteState(r); setV4(''); setV3(''); } },
      () => { if (alive) setRouteState(null); },
    );
    return () => { alive = false; };
  }, [pair?.currency, pair?.target]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pair) {
    return (
      <Control title="Routes" now="no targets set">
        <p className="tiny dim" style={{ marginTop: 8 }}>
          A route is per currency and per target, so there is nothing to route until there are
          targets.
        </p>
      </Control>
    );
  }

  const v4Hops = parseV4(v4);
  const v3Hops = parseV3(v3);

  return (
    <Control
      title="Routes"
      now={`${pair.currencySymbol} → ${pair.targetSymbol}: ${VENUE[pair.venue] ?? pair.venue}`}
      note={<>A v3 route takes precedence over a v4 one, which neither setter tells you. What is in effect is above, and both are shown below.</>}
    >
      <div className={s.form}>
        <label className={s.field}>
          <span className={s.label}>Pair</span>
          <select
            className="select"
            value={at}
            onChange={(e) => setAt(whole(e.target.value) ?? 0)}
          >
            {pairs.map((p, i) => (
              <option key={`${p.currencySymbol}:${p.target}`} value={i}>
                {p.currencySymbol} → {p.targetSymbol} · {VENUE[p.venue] ?? p.venue}
              </option>
            ))}
          </select>
        </label>
      </div>

      {route === null ? (
        <p className="tiny dim" style={{ marginTop: 10 }}>Reading the route…</p>
      ) : (
        <>
          <ReadOnlyBlock label="v4 route now">
            {route.v4.length === 0 ? 'none' : route.v4.map((h, i) => (
              <div key={i}>{`→ ${h.currencyOut} · fee ${h.fee} · spacing ${h.tickSpacing} · hooks ${h.hooks}`}</div>
            ))}
          </ReadOnlyBlock>
          <ReadOnlyBlock label="v3 route now">
            {route.v3.length === 0 ? 'none' : route.v3.map((h, i) => (
              <div key={i}>{`→ pool ${h.pool} · out ${h.tokenOut}`}</div>
            ))}
          </ReadOnlyBlock>
        </>
      )}

      <div className={s.form}>
        <Field
          wide
          label="New v4 route"
          value={v4}
          placeholder="currencyOut, fee, tickSpacing, hooks — one hop per line"
          invalid={v4.trim() !== '' && v4Hops === null}
          hint={`At most ${admin.treasury.bounds.maxHops} hops, ending at ${pair.targetSymbol}.`}
          onChange={setV4}
        />
        <ActionButton
          actions={actions}
          action={{
            key: 'route-v4',
            label: 'Set the v4 route',
            disabled: v4Hops === null || v4Hops.length === 0,
            run: (on) => setRoute(pair.currency, pair.target, v4Hops!, on),
            outcome: () => 'v4 route set.',
          }}
        />
      </div>

      <div className={s.form}>
        <Field
          wide
          label="New v3 route"
          value={v3}
          placeholder="pool, tokenOut — one hop per line"
          invalid={v3.trim() !== '' && v3Hops === null}
          hint="A v3 route, once set, is the one that runs."
          onChange={setV3}
        />
        <ActionButton
          actions={actions}
          action={{
            key: 'route-v3',
            label: 'Set the v3 route',
            disabled: v3Hops === null || v3Hops.length === 0,
            run: (on) => setV3Route(pair.currency, pair.target, v3Hops!, on),
            outcome: () => 'v3 route set.',
          }}
        />
      </div>
    </Control>
  );
}

/** `currencyOut, fee, tickSpacing, hooks` per line. Null if any line is wrong. */
function parseV4(text: string) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const out = [];
  for (const line of lines) {
    const parts = line.split(/[\s,]+/).filter(Boolean);
    if (parts.length !== 4) return null;
    const fee = whole(parts[1]);
    const spacing = whole(parts[2]);
    if (!isAddressish(parts[0]) || !isAddressish(parts[3]) || fee === null || spacing === null) return null;
    out.push({
      currencyOut: parts[0] as Address, fee, tickSpacing: spacing, hooks: parts[3] as Address,
    });
  }
  return out;
}

/** `pool, tokenOut` per line. */
function parseV3(text: string) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const out = [];
  for (const line of lines) {
    const parts = line.split(/[\s,]+/).filter(Boolean);
    if (parts.length !== 2 || parts.some((p) => !isAddressish(p))) return null;
    out.push({ pool: parts[0] as Address, tokenOut: parts[1] as Address });
  }
  return out;
}

// ── floor prices ──────────────────────────────────────────────────────────

function Floors({
  admin, actions,
}: { admin: AdminState; actions: ReturnType<typeof useAdminActions> }) {
  const [at, setAt] = useState(0);
  const [price, setPrice] = useState('');
  const pairs = admin.treasury.pairs;
  const pair = pairs[at];

  if (!pair) return null;

  let parsed: Amount | null = null;
  try { parsed = price.trim() === '' ? null : parseAvians(price); } catch { parsed = null; }

  const youAreKeeper = !!admin.you && admin.treasury.priceKeeper?.toLowerCase() === admin.you.toLowerCase();
  const standing = pair.floorPriceE18;
  const keeperFloor = standing === 0n ? 0n
    : (standing * BigInt(10_000 - admin.treasury.maxKeeperDropBps)) / 10_000n;

  return (
    <Control
      title="Floor prices"
      now={standing === 0n ? 'not set for this pair' : `${formatEth(standing)} per ${pair.targetSymbol}`}
      note={<>A conversion refuses when the pair has no floor, or when the floor is older than the configured price age. Set to zero to clear one.</>}
    >
      <div className={s.form}>
        <label className={s.field}>
          <span className={s.label}>Pair</span>
          <select className="select" value={at} onChange={(e) => setAt(whole(e.target.value) ?? 0)}>
            {pairs.map((p, i) => (
              <option key={`${p.currencySymbol}:${p.target}`} value={i}>
                {p.currencySymbol} → {p.targetSymbol}
                {p.floorPriceE18 === 0n ? ' · no floor' : ''}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Floor price, 1e18"
          value={price}
          placeholder="0.0"
          invalid={price.trim() !== '' && parsed === null}
          hint={pair.floorSetAt === 0 ? 'never set' : `set ${seconds(Math.max(0, Math.floor(Date.now() / 1000) - pair.floorSetAt))} ago`}
          onChange={setPrice}
        />
        <ActionButton
          actions={actions}
          action={{
            key: 'floor',
            label: 'Set the floor',
            disabled: parsed === null,
            run: (on) => setFloorPrice(pair.currency, pair.target, parsed!, on),
            outcome: () => 'Floor set.',
          }}
        />
      </div>

      {youAreKeeper && !admin.isOwner ? (
        <div style={{ marginTop: 12 }}>
          <Note tone="warn">
            You are the price keeper, not the owner. A keeper may not drop a standing floor below{' '}
            <span className="mono">{formatEth(keeperFloor)}</span> — {formatBps(admin.treasury.maxKeeperDropBps)}{' '}
            under what is there now.
          </Note>
        </div>
      ) : null}
    </Control>
  );
}

function KeeperForm({
  admin, actions,
}: { admin: AdminState; actions: ReturnType<typeof useAdminActions> }) {
  const [keeper, setKeeper] = useState('');
  const [bps, setBps] = useState(String(admin.treasury.maxKeeperDropBps));
  const bpsValue = whole(bps);
  const list = addressList(keeper);

  return (
    <>
      <div className={s.form}>
        <Field
          label="Keeper"
          value={keeper}
          placeholder="0x…"
          invalid={keeper !== '' && !isAddressish(keeper)}
          onChange={setKeeper}
        />
        <ActionButton
          actions={actions}
          action={{
            key: 'keeper',
            label: 'Set the keeper',
            disabled: !list || list.length !== 1,
            run: (on) => setPriceKeeper(keeper.trim() as Address, on),
            outcome: () => 'Price keeper set.',
          }}
        />
      </div>
      <div className={s.form}>
        <Field
          label="Keeper drop, bps"
          value={bps}
          hint={bpsValue === null ? 'a whole number' : formatBps(bpsValue)}
          invalid={bpsValue === null}
          onChange={setBps}
        />
        <ActionButton
          ghost
          actions={actions}
          action={{
            key: 'keeper-bps',
            label: 'Set the limit',
            disabled: bpsValue === null,
            run: (on) => setKeeperDropBps(bpsValue!, on),
            outcome: () => 'Limit set.',
          }}
        />
      </div>
      {admin.treasury.priceKeeper === null ? (
        <div style={{ marginTop: 12 }}>
          <Box tone="warn">
            <p className="small" style={{ margin: 0 }}>
              No keeper is set, so only the owner can refresh a floor price — and a floor older
              than {seconds(admin.treasury.conversion.maxPriceAge)} stops conversions.
            </p>
          </Box>
        </div>
      ) : <Tag>Keeper set</Tag>}
    </>
  );
}
