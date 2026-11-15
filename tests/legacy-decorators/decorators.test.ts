import { describeDecorators } from '../support/decorated-fixture.ts';

// Runs the same fixture as tests/unit/decorators with `experimentalDecorators` lowering
// (`npx vitest run --project decorators-legacy`).
describeDecorators();
