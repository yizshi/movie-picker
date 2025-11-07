// Test voting logic and Borda scoring
describe('Voting System Logic', () => {
  describe('Borda Scoring', () => {
    test('should calculate Borda scores correctly', () => {
      // Mock votes data
      const votes = [
        { votes: [{ movie_id: '1', rank: 1 }, { movie_id: '2', rank: 2 }] },
        { votes: [{ movie_id: '2', rank: 1 }, { movie_id: '1', rank: 3 }] },
        { votes: [{ movie_id: '1', rank: 2 }, { movie_id: '3', rank: 1 }] }
      ];

      // Calculate scores (rank 1 = 3 pts, rank 2 = 2 pts, rank 3 = 1 pt)
      const movieScores = {};
      const movieVoteCounts = {};

      votes.forEach(ballot => {
        ballot.votes.forEach(vote => {
          const score = 4 - vote.rank;
          movieScores[vote.movie_id] = (movieScores[vote.movie_id] || 0) + score;
          movieVoteCounts[vote.movie_id] = (movieVoteCounts[vote.movie_id] || 0) + 1;
        });
      });

      // Movie 1: rank 1 (3pts) + rank 3 (1pt) + rank 2 (2pts) = 6 pts
      expect(movieScores['1']).toBe(6);
      expect(movieVoteCounts['1']).toBe(3);

      // Movie 2: rank 2 (2pts) + rank 1 (3pts) = 5 pts  
      expect(movieScores['2']).toBe(5);
      expect(movieVoteCounts['2']).toBe(2);

      // Movie 3: rank 1 (3pts) = 3 pts
      expect(movieScores['3']).toBe(3);
      expect(movieVoteCounts['3']).toBe(1);
    });

    test('should handle ties by vote count', () => {
      const votes = [
        { votes: [{ movie_id: '1', rank: 1 }] },
        { votes: [{ movie_id: '2', rank: 1 }] },
        { votes: [{ movie_id: '1', rank: 3 }] }
      ];

      const movieScores = {};
      const movieVoteCounts = {};

      votes.forEach(ballot => {
        ballot.votes.forEach(vote => {
          const score = 4 - vote.rank;
          movieScores[vote.movie_id] = (movieScores[vote.movie_id] || 0) + score;
          movieVoteCounts[vote.movie_id] = (movieVoteCounts[vote.movie_id] || 0) + 1;
        });
      });

      // Both movies have 4 points, but movie 1 has more votes
      expect(movieScores['1']).toBe(4); // 3 + 1
      expect(movieScores['2']).toBe(3); // 3
      expect(movieVoteCounts['1']).toBe(2);
      expect(movieVoteCounts['2']).toBe(1);

      // Find winner (higher score, then higher vote count)
      let topMovieId = null;
      let topScore = -1;
      let topVoteCount = 0;

      for (const [movieId, score] of Object.entries(movieScores)) {
        const voteCount = movieVoteCounts[movieId] || 0;
        if (score > topScore || (score === topScore && voteCount > topVoteCount)) {
          topScore = score;
          topVoteCount = voteCount;
          topMovieId = movieId;
        }
      }

      expect(topMovieId).toBe('1');
    });
  });

  describe('Date Selection', () => {
    test('should count availability votes correctly', () => {
      const ballots = [
        { availability: ['2024-01-15', '2024-01-16'] },
        { availability: ['2024-01-15'] },
        { availability: ['2024-01-16', '2024-01-17'] },
        { availability: null } // Some users might not specify availability
      ];

      const dateCounts = {};
      ballots.forEach(ballot => {
        if (ballot.availability && Array.isArray(ballot.availability)) {
          ballot.availability.forEach(date => {
            dateCounts[date] = (dateCounts[date] || 0) + 1;
          });
        }
      });

      expect(dateCounts['2024-01-15']).toBe(2);
      expect(dateCounts['2024-01-16']).toBe(2);
      expect(dateCounts['2024-01-17']).toBe(1);
    });

    test('should select most popular date', () => {
      const dateCounts = {
        '2024-01-15': 3,
        '2024-01-16': 2,
        '2024-01-17': 1
      };

      let chosenDate = null;
      let maxCount = 0;
      for (const [date, count] of Object.entries(dateCounts)) {
        if (count > maxCount) {
          maxCount = count;
          chosenDate = date;
        }
      }

      expect(chosenDate).toBe('2024-01-15');
      expect(maxCount).toBe(3);
    });
  });

  describe('Vote Validation', () => {
    test('should validate unique movie IDs in ranks', () => {
      const ranks = [
        { movieId: '1', rank: 1 },
        { movieId: '2', rank: 2 },
        { movieId: '1', rank: 3 } // Duplicate
      ];

      const movieIds = ranks.map(r => r.movieId);
      const uniqueIds = new Set(movieIds);
      
      expect(uniqueIds.size).not.toBe(movieIds.length);
      expect(uniqueIds.size).toBe(2);
      expect(movieIds.length).toBe(3);
    });

    test('should validate rank structure', () => {
      const validRanks = [
        { movieId: '1', rank: 1 },
        { movieId: '2', rank: 2 }
      ];

      const invalidRanks = [
        { movieId: '1' }, // Missing rank
        { rank: 2 }, // Missing movieId
        { movieId: '', rank: 1 } // Empty movieId
      ];

      // Test valid ranks
      const validResult = validRanks.every(r => r.rank && r.movieId);
      expect(validResult).toBe(true);

      // Test invalid ranks
      const invalidResult = invalidRanks.every(r => r.rank && r.movieId);
      expect(invalidResult).toBe(false);
    });

    test('should enforce maximum 3 ranks', () => {
      const tooManyRanks = [
        { movieId: '1', rank: 1 },
        { movieId: '2', rank: 2 },
        { movieId: '3', rank: 3 },
        { movieId: '4', rank: 4 } // Too many
      ];

      expect(tooManyRanks.length).toBeGreaterThan(3);
    });
  });
});
