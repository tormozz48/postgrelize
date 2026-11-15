import { fileURLToPath } from 'node:url';
import { LlmAssetBuilder } from '../docs/.vitepress/llm/asset-builder.ts';

new LlmAssetBuilder(fileURLToPath(new URL('..', import.meta.url))).write();
