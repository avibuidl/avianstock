// The Bird Engine (2026-09-25; its first day it was "the Flywheel page"),
// where Contracts was: the protocol's machinery on a page of its own, so the
// Nest can be about brooding and the Roost page about staking.
//
// Two by two on a wide screen. Above: the Treasury card (where the ETH lands,
// and the two presses anybody may make on it) beside the Roost card (where
// every AVIAN fee lands, its split, Distribute and Deliver). Below, what they
// feed: the Nest's streams beside the figures, drawn as the homepage Flywheel
// section's cards. One column on a phone.
//
// The page owns the two reads the figures share with a card, the Roost's and
// the brood, and hands each over, so nothing is read twice.
//
// #/bird-engine/roost opens the page at the Roost card: the homepage's "See
// the Roost" and the Owner page's Roost panel point there.

import { NestFigures, RoostFigures } from '../components/Counters';
import { RoostCard } from '../components/RoostCard';
import { StreamsBlock } from '../components/Streams';
import { TreasuryCard } from '../components/TreasuryCard';
import { useTx } from '../components/Tx';
import { useBrood, useFlywheel, useRoostScreen } from '../mock';
import { useOpenAt } from '../router';

export function BirdEngine({ onConnect, at }: { onConnect: () => void; at?: string }) {
  useOpenAt(at);
  const tx = useTx();
  // Not while a transaction is in flight, as the Roost card's own read was.
  const roost = useRoostScreen({ paused: tx.busy });
  const brood = useBrood();
  const fly = useFlywheel();

  return (
    <div className="page page--wide">
      <h2>The Bird Engine</h2>
      <p className="lede" style={{ maxWidth: 820 }}>The live aviary working as built</p>

      <div className="engine">
        <div id="treasury" className="engine__cell">
          <TreasuryCard />
        </div>
        <div className="engine__cell">
          <RoostCard onConnect={onConnect} id="roost" read={roost} />
        </div>
        <div id="streams" className="engine__cell engine__streams">
          <StreamsBlock fly={fly.data} read={brood} />
        </div>
        <div className="engine__cell engine__figures">
          {roost.data ? <RoostFigures r={roost.data.roost} /> : null}
          {brood.data ? <NestFigures r={brood.data} /> : null}
        </div>
      </div>
    </div>
  );
}
