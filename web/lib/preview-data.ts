export type SkillSource = '.cursor' | '.claude' | '.windsurf' | '.agents'

export type InboxSkill = {
  id: string
  name: string
  source: SkillSource
}

export type Command = {
  id: string
  name: string
  skillIds: string[]
}

export const inboxSkills: InboxSkill[] = [
  { id: 'agent-browser', name: 'agent-browser', source: '.cursor' },
  { id: 'find-skills', name: 'find-skills', source: '.claude' },
  { id: 'frontend-design', name: 'frontend-design', source: '.cursor' },
  { id: 'grill-me', name: 'grill-me', source: '.windsurf' },
]

export const commands: Command[] = [
  {
    id: 'planning',
    name: '/planning',
    skillIds: ['find-skills', 'improve-codebase-architecture'],
  },
  {
    id: 'build',
    name: '/build',
    skillIds: ['frontend-design'],
  },
  {
    id: 'test',
    name: '/testing',
    skillIds: [],
  },
  {
    id: 'review',
    name: '/review',
    skillIds: ['grill-with-docs'],
  },
]
