export interface AIReviewComment {
  file_path: string;
  line_number: number;
  severity: 'major' | 'minor' | 'suggestion';
  comment: string;
}

export interface DiffChunk {
  filePath: string;
  diff: string;
  isNewFile: boolean;
  isDeletedFile: boolean;
}
