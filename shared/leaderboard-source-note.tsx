const SKILLS_SH_URL = 'https://skills.sh';

/** Right-aligned skills.sh attribution (GUI Discover + web leaderboard). */
export function LeaderboardSourceNote({ linkClassName = 'leaderboard-source-link' }: { linkClassName?: string }) {
  return (
    <p className="leaderboard-source-note">
      See more at{' '}
      <a href={SKILLS_SH_URL} target="_blank" rel="noopener noreferrer" className={linkClassName}>
        <span>skills.sh</span>
      </a>
    </p>
  );
}
