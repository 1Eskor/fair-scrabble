// Test script for parallel and intersecting diagonal plays

function normalizeDirection(dir) {
  if (!dir) return dir;
  if (dir.dc > 0) return dir;
  if (dir.dc < 0) return { dr: -dir.dr, dc: -dir.dc };
  if (dir.dr > 0) return dir;
  return { dr: -dir.dr, dc: -dir.dc };
}

function traverseWord(startR, startC, dr, dc, board, tentativePlaced) {
  let r = startR;
  let c = startC;
  while (true) {
    const prevR = r - dr;
    const prevC = c - dc;
    const prevKey = `${prevR},${prevC}`;
    if (board[prevKey] || tentativePlaced[prevKey]) {
      r = prevR;
      c = prevC;
    } else {
      break;
    }
  }
  const wordCells = [];
  while (true) {
    const key = `${r},${c}`;
    const cell = tentativePlaced[key] || board[key];
    if (cell) {
      wordCells.push({ r, c, tile: cell, isNew: !!tentativePlaced[key] });
      r += dr;
      c += dc;
    } else {
      break;
    }
  }
  return wordCells;
}

function runValidationTest(scenarioName, board, tentativePlaced, direction, isFirstMove) {
  console.log(`\n--- Running Test: ${scenarioName} ---`);
  const coords = Object.keys(tentativePlaced).map(k => {
    const [r, c] = k.split(',').map(Number);
    return { r, c };
  });

  let axesToScan = [];
  const normPrimary = normalizeDirection(direction);
  axesToScan.push(normPrimary);

  const isPrimaryDiagonal = Math.abs(normPrimary.dr) === 1 && Math.abs(normPrimary.dc) === 1;

  let candidateDirs = [];
  if (isPrimaryDiagonal) {
    candidateDirs = [
      { dr: 1, dc: 1 },
      { dr: -1, dc: 1 },
      { dr: 0, dc: 1 },
      { dr: 1, dc: 0 }
    ];
  } else {
    candidateDirs = [
      { dr: 0, dc: 1 },
      { dr: 1, dc: 0 }
    ];
  }

  coords.forEach(co => {
    candidateDirs.forEach(dir => {
      const normDir = normalizeDirection(dir);
      const isPrimaryDir = (normDir.dr === normPrimary.dr && normDir.dc === normPrimary.dc);
      if (!isPrimaryDir) {
        axesToScan.push({ dr: normDir.dr, dc: normDir.dc, fromCoord: co });
      }
    });
  });

  const registeredWordSignatures = new Set();
  const formedWordsList = [];

  axesToScan.forEach(axis => {
    const anchor = axis.fromCoord || coords[0];
    const wordCells = traverseWord(anchor.r, anchor.c, axis.dr, axis.dc, board, tentativePlaced);

    if (wordCells.length > 1) {
      const first = wordCells[0];
      const last = wordCells[wordCells.length - 1];
      const sig = `${first.r},${first.c}-${last.r},${last.c}`;

      if (!registeredWordSignatures.has(sig)) {
        registeredWordSignatures.add(sig);
        const normalString = wordCells.map(wc => wc.tile.letter).join('');
        const normAxis = normalizeDirection({ dr: axis.dr, dc: axis.dc });
        formedWordsList.push({
          cells: wordCells,
          forwardWord: normalString,
          axis: normAxis
        });
      }
    }
  });

  // Identify Intersection Groups
  const intersectionGroups = [];
  if (!isFirstMove && coords.length > 1) {
    const mainAxis = normalizeDirection(direction);
    const mainWord = formedWordsList.find(w => w.axis.dr === mainAxis.dr && w.axis.dc === mainAxis.dc);
    
    if (mainWord && mainWord.cells) {
      for (let i = 1; i < mainWord.cells.length - 1; i++) {
        const cell = mainWord.cells[i];
        if (!cell.isNew) {
          const prevCell = mainWord.cells[i-1];
          const nextCell = mainWord.cells[i+1];
          if (prevCell && prevCell.isNew && nextCell && nextCell.isNew) {
            const isAdjacent = (r1, c1, r2, c2) => Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1;
            const leftWords = formedWordsList.filter(w => 
              w !== mainWord && 
              w.cells.some(c => c.r === prevCell.r && c.c === prevCell.c) &&
              w.cells.some(c => !c.isNew && isAdjacent(c.r, c.c, cell.r, cell.c))
            );
            const rightWords = formedWordsList.filter(w => 
              w !== mainWord && 
              w.cells.some(c => c.r === nextCell.r && c.c === nextCell.c) &&
              w.cells.some(c => !c.isNew && isAdjacent(c.r, c.c, cell.r, cell.c))
            );
            if (leftWords.length > 0 && rightWords.length > 0) {
              intersectionGroups.push({ leftWords: leftWords.map(w=>w.forwardWord), rightWords: rightWords.map(w=>w.forwardWord) });
            }
          }
        }
      }
    }
  }

  console.log("Formed Words:");
  formedWordsList.forEach(w => console.log(`  - ${w.forwardWord} (Axis: ${w.axis.dr},${w.axis.dc})`));
  console.log("Intersection Groups:", JSON.stringify(intersectionGroups, null, 2));
}

// Scenario 1: Parallel Diagonal Play
// TUBE is on board diagonally at (1,1) to (4,4).
// YES is played parallel diagonally at (2,1) to (4,3).
const board1 = {
  '1,1': { letter: 'T' },
  '2,2': { letter: 'U' },
  '3,3': { letter: 'B' },
  '4,4': { letter: 'E' }
};
const play1 = {
  '2,1': { letter: 'Y' },
  '3,2': { letter: 'E' },
  '4,3': { letter: 'S' }
};
runValidationTest("YES parallel to TUBE", board1, play1, { dr: 1, dc: 1 }, false);

// Scenario 2: Intersecting Play
// HORIZON is horizontal at (2,1) to (2,7).
// DIAG is diagonal crossing at 'I' (2,4).
// DIAG coordinates: D(0,2), I(1,3), A(2,4) [shared], G(3,5).
// Wait, I is at (2,4). Let's say HORIZON is H(2,1), O(2,2), R(2,3), I(2,4), Z(2,5), O(2,6), N(2,7)
// DIAG crosses at (2,4). D(0,2), I(1,3), A(2,4) -- wait, I is at 2,4. So D is at (0,2), I is at (1,3)... wait.
// If A is at (2,4) [shared]. D is at (0,2)? No, D(-1,1), I(0,2), A(1,3), G(2,4).
// Let's just use I(2,4) as the shared tile.
// D(0,2), I(1,3)[new? No, let's make I shared]. 
// Actually, let's use the D I A G crossing H O R I Z O N at I.
// H O R I Z O N is at Row 2, Cols 1 to 7. I is at (2, 4).
// So D is at (0, 2). I_NEW is at (1,3). A is at (2,4)[shared]. G is at (3,5).
// Wait, D I A G has 'A' at (2,4). So shared tile is A.
const board2 = {
  '2,1': { letter: 'H' },
  '2,2': { letter: 'O' },
  '2,3': { letter: 'R' },
  '2,4': { letter: 'A' }, // HORAZON? Let's say HORAZON for testing
  '2,5': { letter: 'Z' },
  '2,6': { letter: 'O' },
  '2,7': { letter: 'N' }
};
const play2 = {
  '0,2': { letter: 'D' },
  '1,3': { letter: 'I' },
  '3,5': { letter: 'G' }
};
runValidationTest("DIAG crossing HORAZON at A", board2, play2, { dr: 1, dc: 1 }, false);

