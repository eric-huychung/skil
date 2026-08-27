import { describe, expect, it } from 'vitest';
import {
  MAX_RECENT_FOLDERS,
  folderLabel,
  folderPreview,
  forgetFolder,
  parseRecentFolders,
  rememberFolder,
} from './recent-folders.js';

describe('rememberFolder', () => {
  it('puts a new folder first', () => {
    expect(rememberFolder('/tmp/b', ['/tmp/a'])).toEqual(['/tmp/b', '/tmp/a']);
  });

  it('moves an already-known folder to the front without duplicating it', () => {
    expect(rememberFolder('/tmp/a', ['/tmp/b', '/tmp/a', '/tmp/c'])).toEqual([
      '/tmp/a',
      '/tmp/b',
      '/tmp/c',
    ]);
  });

  it('keeps only the five most recent folders', () => {
    expect(
      rememberFolder('/tmp/f', ['/tmp/e', '/tmp/d', '/tmp/c', '/tmp/b', '/tmp/a'])
    ).toEqual(['/tmp/f', '/tmp/e', '/tmp/d', '/tmp/c', '/tmp/b']);
    expect(MAX_RECENT_FOLDERS).toBe(5);
  });
});

describe('forgetFolder', () => {
  it('removes that folder and leaves the rest in order', () => {
    expect(forgetFolder('/tmp/b', ['/tmp/a', '/tmp/b', '/tmp/c'])).toEqual(['/tmp/a', '/tmp/c']);
  });
});

describe('parseRecentFolders', () => {
  it('reads a stored list and drops junk, blanks, and anything past five', () => {
    expect(
      parseRecentFolders(['/tmp/a', 3, '', '/tmp/b', '/tmp/a', '/tmp/c', '/tmp/d', '/tmp/e', '/tmp/f'])
    ).toEqual(['/tmp/a', '/tmp/b', '/tmp/c', '/tmp/d', '/tmp/e']);
    expect(parseRecentFolders({ paths: ['/tmp/a'] })).toEqual([]);
  });
});

describe('folderLabel', () => {
  it('shows the last path segment as the folder name', () => {
    expect(folderLabel('/Users/chung/work/skil')).toBe('skil');
    expect(folderLabel('C:\\Users\\chung\\work\\skil')).toBe('skil');
  });
});

describe('folderPreview', () => {
  it('shows the last three path segments', () => {
    expect(folderPreview('/Users/chung/Desktop/HOME/SWE/PROJECTS/skil/TESTING FOLDER')).toBe(
      'PROJECTS/skil/TESTING FOLDER'
    );
    expect(folderPreview('C:\\Users\\chung\\work\\skil')).toBe('chung/work/skil');
  });

  it('shows the whole path when it is already short', () => {
    expect(folderPreview('/tmp/alpha')).toBe('tmp/alpha');
    expect(folderPreview('skil')).toBe('skil');
  });
});
