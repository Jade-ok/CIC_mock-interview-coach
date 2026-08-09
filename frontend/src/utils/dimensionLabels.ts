export interface DimensionInfo {
  label: string;
  description: string;
}

export const DIMENSION_LABELS: Record<string, DimensionInfo> = {
  concrete_example: {
    label: 'Concrete example',
    description: 'Did you point to a real project or moment?',
  },
  star_structure: {
    label: 'STAR structure',
    description: 'Was the story structured as Situation, Task, Action, Result?',
  },
  link_to_job: {
    label: 'Link to the job',
    description: 'Did you connect it to this role?',
  },
  quantifiable_outcome: {
    label: 'Quantifiable outcome',
    description: 'Did you show measurable impact?',
  },
};

export const DIMENSION_KEYS = Object.keys(DIMENSION_LABELS) as Array<keyof typeof DIMENSION_LABELS>;
