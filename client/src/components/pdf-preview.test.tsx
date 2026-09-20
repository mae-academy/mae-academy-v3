// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PdfErrorBoundary from './PdfErrorBoundary';
import PdfPreviewFallback from './PdfPreviewFallback';
import { isRouteActive } from '@/data/platform';

afterEach(cleanup);

describe('PdfErrorBoundary', () => {
  const Boom = (): never => {
    throw new Error('chunk failed');
  };

  it('replaces a crashing viewer with the fallback instead of unmounting to a blank page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <PdfErrorBoundary fallback={<PdfPreviewFallback landingPageUrl="https://doi.org/10.1/x" />}>
        <Boom />
      </PdfErrorBoundary>,
    );
    expect(screen.getByText('Preview Not Available')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Publisher Page/ }).getAttribute('href')).toBe('https://doi.org/10.1/x');
  });

  it('renders children untouched when nothing fails', () => {
    render(
      <PdfErrorBoundary fallback={<span>fallback</span>}>
        <span>viewer</span>
      </PdfErrorBoundary>,
    );
    expect(screen.getByText('viewer')).toBeTruthy();
    expect(screen.queryByText('fallback')).toBeNull();
  });
});

describe('isRouteActive', () => {
  it('keeps a section highlighted on nested pages', () => {
    expect(isRouteActive('/research', '/research')).toBe(true);
    expect(isRouteActive('/research/W4226195437', '/research')).toBe(true);
  });
  it('does not over-match', () => {
    expect(isRouteActive('/researchers', '/research')).toBe(false);
    expect(isRouteActive('/research/W1', '/')).toBe(false);
    expect(isRouteActive('/', '/')).toBe(true);
    expect(isRouteActive('/courses', '/research')).toBe(false);
  });
});
