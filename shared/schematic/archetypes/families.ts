// The ONLY file that lists archetype families. To add yours: create `archetypes/<family>.ts` exporting `ARCHETYPE_LIST`,
// then append ONE line below (keep the alias unique). Nothing else in the engine needs to change.
export { ARCHETYPE_LIST as rectifiers } from './rectifiers';
export { ARCHETYPE_LIST as converters } from './converters';
export { ARCHETYPE_LIST as powerExtra } from './powerExtra';
export { ARCHETYPE_LIST as analog } from './analog';
export { ARCHETYPE_LIST as discrete } from './discrete';
