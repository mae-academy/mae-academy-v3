import { describe, expect, it } from 'vitest';
import { COLUMN_MARGIN, ELEMENT_PITCH, ROW_HEIGHT, layoutLadder } from './ladderLayout';
import { startStopExample } from './ladderExamples';
import { addParallel, addPath, addSeries, makeElement } from './relayLadder';

describe('ladder layout', () => {
  it('an empty circuit still has both rails, room for the first path and a site to add one', () => {
    const layout = layoutLadder({ paths: [] });
    expect(layout.columns).toEqual([]);
    expect(layout.bottomRailY).toBeGreaterThan(layout.topRailY);
    expect(layout.railRight).toBeGreaterThan(layout.railLeft);
    expect(layout.newPathSite.x).toBeGreaterThan(layout.railLeft);
  });

  it('numbers the current paths 1…N from left to right without overlap', () => {
    const layout = layoutLadder(startStopExample());
    expect(layout.columns.map(column => column.number)).toEqual([1, 2]);
    const [first, second] = layout.columns;
    expect(first.left + first.width).toBe(second.left);
    expect(second.spine).toBeGreaterThan(first.spine);
  });

  it('a parallel group widens its column and centres its elements on the spine', () => {
    const layout = layoutLadder(startStopExample());
    const [first, second] = layout.columns;
    expect(first.width).toBe(2 * ELEMENT_PITCH + COLUMN_MARGIN);
    expect(second.width).toBe(ELEMENT_PITCH + COLUMN_MARGIN);
    const [start, hold] = first.groups[0].elements;
    expect(hold.x - start.x).toBe(ELEMENT_PITCH);
    expect((start.x + hold.x) / 2).toBe(first.spine);
    expect(first.groups[0].busLeft).toBe(start.x);
    expect(first.groups[0].busRight).toBe(hold.x);
    // the single element below sits on the spine
    expect(first.groups[1].elements[0].x).toBe(first.spine);
  });

  it('stacks conditions top to bottom and puts every load on one line above the 0 V rail', () => {
    const layout = layoutLadder(startStopExample());
    const [first, second] = layout.columns;
    expect(first.groups[1].y - first.groups[0].y).toBe(ROW_HEIGHT);
    expect(first.groups[0].y).toBeGreaterThan(layout.topRailY);
    expect(first.load!.y).toBe(second.load!.y);
    expect(first.load!.y).toBe(layout.loadY);
    expect(layout.loadY).toBeLessThan(layout.bottomRailY);
    expect(layout.tableY).toBeGreaterThan(layout.bottomRailY);
    expect(layout.height).toBeGreaterThan(layout.tableY);
  });

  it('keeps the loads level when one path is much longer than the others', () => {
    let circuit = addPath(addPath({ paths: [] }));
    for (let n = 0; n < 4; n++) circuit = addSeries(circuit, circuit.paths[0].id, makeElement('sensor', `1B${n + 1}`));
    const layout = layoutLadder(circuit);
    const [tall, short] = layout.columns;
    expect(tall.groups).toHaveLength(4);
    expect(short.groups).toHaveLength(0);
    expect(tall.loadSite.y).toBe(short.loadSite.y);
    // the free site for the next series condition is right below the last one and above the load
    expect(tall.seriesSite.y - tall.groups[3].y).toBe(ROW_HEIGHT);
    expect(tall.seriesSite.y).toBeLessThan(layout.loadY);
    expect(short.seriesSite.y).toBeLessThan(layout.loadY);
  });

  it('offers the add-in-parallel site just beyond the last element of a group', () => {
    let circuit = addPath({ paths: [] });
    circuit = addSeries(circuit, circuit.paths[0].id, makeElement('sensor', '1B1'));
    circuit = addParallel(circuit, circuit.paths[0].id, 0, makeElement('sensor', '1B2'));
    const [column] = layoutLadder(circuit).columns;
    const group = column.groups[0];
    expect(group.parallelSite.x).toBeGreaterThan(group.busRight);
    expect(group.parallelSite.x).toBeLessThan(column.left + column.width);
  });
});
