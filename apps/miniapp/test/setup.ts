import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import { notifyManager } from '@tanstack/react-query';
import { setCommunityId } from '../src/state/community';
import { queryClient } from '../src/lib/queryClient';

afterEach(() => { cleanup(); queryClient.clear(); setCommunityId(null); });

// JSDOM has no top layer; real focus containment/backdrop are verified in Playwright.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

// Deliver cache notifications synchronously so tests (also with fake timers) don't wait for a macrotask.
notifyManager.setScheduler(callback => callback());
