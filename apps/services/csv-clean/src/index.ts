import { suiteHash, type TestSuite } from 'shared';

export function cleanCsv(input: { csv: string }): string {
  if (!input || typeof input.csv !== 'string') throw new Error('Expected csv string');
  return input.csv
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0)
    .map(line => line.split(',').map(cell => cell.trim()).join(','))
    .join('\n');
}

export const csvCleanExpected: Record<string, string> = {
  trim: 'name,city\nAsha,Delhi',
  blanks: 'a,b\n1,2',
  crlf: 'a,b\n1,2',
  trailing: 'a,b',
  quotedComma: '"Last, First",Age\n"Rao, Mira",30',
  quotedNewline: 'id,note\n1,"first line\n  second line"',
  unicode: 'name\ncafé',
  bom: 'name\nRia',
  escapedQuote: 'name,note\nMira,"said ""yes"""',
  tabs: 'a,b\n1,2',
  unchanged: 'x,y\n3,4',
  empty: '',
};

export const csvCleanSuite: TestSuite = {
  version: 1, serviceName: 'csv-clean', category: 'data-cleaning', determinism: 'none',
  cases: [
    { id: 'trim', input: { csv: ' name , city \n Asha , Delhi ' }, expect: { kind: 'exact', value: csvCleanExpected.trim }, weight: 1 },
    { id: 'blanks', input: { csv: 'a,b\n\n1,2\n' }, expect: { kind: 'exact', value: csvCleanExpected.blanks }, weight: 1 },
    { id: 'crlf', input: { csv: 'a,b\r\n1,2\r\n' }, expect: { kind: 'exact', value: csvCleanExpected.crlf }, weight: 1 },
    { id: 'trailing', input: { csv: 'a,b\n\n' }, expect: { kind: 'exact', value: csvCleanExpected.trailing }, weight: 1 },
    { id: 'quotedComma', input: { csv: '"Last, First", Age\n"Rao, Mira",30' }, expect: { kind: 'exact', value: csvCleanExpected.quotedComma }, weight: 1 },
    { id: 'quotedNewline', input: { csv: 'id,note\n1,"first line\n  second line"' }, expect: { kind: 'exact', value: csvCleanExpected.quotedNewline }, weight: 1 },
    { id: 'unicode', input: { csv: 'name\ncafe\u0301' }, expect: { kind: 'exact', value: csvCleanExpected.unicode }, weight: 1 },
    { id: 'bom', input: { csv: '\uFEFFname\nRia' }, expect: { kind: 'exact', value: csvCleanExpected.bom }, weight: 1 },
    { id: 'escapedQuote', input: { csv: 'name,note\nMira,"said ""yes"""' }, expect: { kind: 'exact', value: csvCleanExpected.escapedQuote }, weight: 1 },
    { id: 'tabs', input: { csv: ' a \t, b \n 1 , 2 ' }, expect: { kind: 'schema', schema: { type: 'string', minLength: 1 } }, weight: 1 },
    { id: 'unchanged', input: { csv: 'x,y\n3,4' }, expect: { kind: 'regex', pattern: '^x,y\\n3,4$' }, weight: 1 },
    { id: 'empty', input: { csv: '\n  \n' }, expect: { kind: 'judge', rubric: 'The cleaned empty CSV should be the empty string.' }, weight: 1 },
  ],
};
export const csvCleanSpecHash = suiteHash(csvCleanSuite);
