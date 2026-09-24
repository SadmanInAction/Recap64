import { CLASS_INFO, CLASSIFICATIONS } from '../analysis/classify';
import type { GameAnalysis } from '../analysis/types';
import { ClassIcon } from './ClassIcon';

export function Summary({ analysis }: { analysis: GameAnalysis }) {
  const h = analysis.game.headers;
  return (
    <div className="summary">
      <div className="acc-row">
        <div className="acc-player">
          <span className="acc-name">{h.White ?? 'White'}</span>
          <span className="acc-box white">{analysis.accuracy.w.toFixed(1)}</span>
        </div>
        <span className="acc-label">Accuracy</span>
        <div className="acc-player">
          <span className="acc-name">{h.Black ?? 'Black'}</span>
          <span className="acc-box black">{analysis.accuracy.b.toFixed(1)}</span>
        </div>
      </div>

      <table className="class-table">
        <tbody>
          {CLASSIFICATIONS.map((c) => (
            <tr key={c}>
              <td className="num" style={{ color: CLASS_INFO[c].color }}>
                {analysis.counts.w[c]}
              </td>
              <td className="label">
                <ClassIcon type={c} size={20} />
                <span>{CLASS_INFO[c].label}</span>
              </td>
              <td className="num" style={{ color: CLASS_INFO[c].color }}>
                {analysis.counts.b[c]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
