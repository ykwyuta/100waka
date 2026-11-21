use std::cell::RefCell;

const POEMS: &str = include_str!("../data/poems.tsv");
const CATALOG: &str = include_str!("../data/catalog.tsv");
const COUNT: usize = 100;
const ROUND_SIZE: usize = 10;

struct Game {
    deck: [usize; COUNT],
    position: usize,
    choices: [usize; 3],
    missed: u8,
    solved: bool,
    stars: usize,
    random: u32,
}

impl Game {
    fn new(seed: u32) -> Self {
        let mut game = Self {
            deck: std::array::from_fn(|i| i),
            position: 0,
            choices: [0; 3],
            missed: 0,
            solved: false,
            stars: 0,
            random: seed.max(1),
        };
        for i in (1..COUNT).rev() {
            let j = game.draw(i + 1);
            game.deck.swap(i, j);
        }
        game.prepare();
        game
    }

    fn draw(&mut self, limit: usize) -> usize {
        self.random ^= self.random << 13;
        self.random ^= self.random >> 17;
        self.random ^= self.random << 5;
        self.random as usize % limit
    }

    fn prepare(&mut self) {
        let answer = self.deck[self.position];
        let mut choices = [answer; 3];
        for i in 1..choices.len() {
            loop {
                let candidate = self.draw(COUNT);
                if !choices[..i].contains(&candidate) {
                    choices[i] = candidate;
                    break;
                }
            }
        }
        for i in (1..choices.len()).rev() {
            let j = self.draw(i + 1);
            choices.swap(i, j);
        }
        self.choices = choices;
        self.solved = false;
        self.missed = 0;
    }

    fn choose(&mut self, index: usize) -> u32 {
        if self.solved || index >= self.choices.len() || self.missed & (1 << index) != 0 {
            return 0;
        }
        if self.choices[index] == self.deck[self.position] {
            self.solved = true;
            self.stars += usize::from(self.missed == 0);
            return 2;
        }
        self.missed |= 1 << index;
        1
    }

    fn advance(&mut self) -> u32 {
        if !self.solved {
            return 0;
        }
        if self.position + 1 == COUNT {
            return 3;
        }
        self.position += 1;
        self.prepare();
        if self.position % ROUND_SIZE == 0 {
            self.stars = 0;
            return 2;
        }
        1
    }
}

thread_local! {
    static GAME: RefCell<Game> = RefCell::new(Game::new(1));
}

#[no_mangle]
pub extern "C" fn game_start(seed: u32) {
    GAME.with(|game| *game.borrow_mut() = Game::new(seed));
}

#[no_mangle]
pub extern "C" fn game_position() -> usize {
    GAME.with(|game| game.borrow().position)
}

#[no_mangle]
pub extern "C" fn game_answer() -> usize {
    GAME.with(|game| {
        let game = game.borrow();
        game.deck[game.position]
    })
}

#[no_mangle]
pub extern "C" fn game_choice(index: usize) -> usize {
    GAME.with(|game| game.borrow().choices.get(index).copied().unwrap_or(COUNT))
}

#[no_mangle]
pub extern "C" fn game_choose(index: usize) -> u32 {
    GAME.with(|game| game.borrow_mut().choose(index))
}

#[no_mangle]
pub extern "C" fn game_advance() -> u32 {
    GAME.with(|game| game.borrow_mut().advance())
}

#[no_mangle]
pub extern "C" fn game_stars() -> usize {
    GAME.with(|game| game.borrow().stars)
}

#[no_mangle]
pub extern "C" fn poems_ptr() -> *const u8 {
    POEMS.as_ptr()
}

#[no_mangle]
pub extern "C" fn poems_len() -> usize {
    POEMS.len()
}

#[no_mangle]
pub extern "C" fn catalog_ptr() -> *const u8 {
    CATALOG.as_ptr()
}

#[no_mangle]
pub extern "C" fn catalog_len() -> usize {
    CATALOG.len()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn every_poem_has_an_illustrated_catalog_entry() {
        let mut names = HashSet::new();
        assert_eq!(CATALOG.lines().count(), COUNT);
        for row in CATALOG.lines() {
            let columns: Vec<_> = row.split('\t').collect();
            assert_eq!(columns.len(), 7);
            assert!(columns.iter().all(|column| !column.trim().is_empty()));
            assert!(names.insert(columns[0]));
            assert_eq!(columns[2].len(), 2);
            let art: usize = columns[2].parse().unwrap();
            assert!((1..=16).contains(&art));
        }
    }

    #[test]
    fn corpus_has_unique_choices_in_both_writing_modes() {
        let rows: Vec<_> = POEMS.lines().map(|line| line.split('\t').collect::<Vec<_>>()).collect();
        assert_eq!(rows.len(), COUNT);
        assert!(rows.iter().all(|row| row.len() == 4 && row.iter().all(|s| !s.is_empty())));
        for column in 0..4 {
            assert_eq!(rows.iter().map(|row| row[column]).collect::<HashSet<_>>().len(), COUNT);
        }
    }

    #[test]
    fn deck_covers_every_poem_once_and_checks_retries_and_rounds() {
        for seed in [0, 1, 42, u32::MAX] {
            let mut game = Game::new(seed);
            let mut seen = HashSet::new();
            for i in 0..COUNT {
                assert_eq!(game.position, i);
                let answer = game.deck[i];
                assert!(seen.insert(answer));
                assert_eq!(game.choices.iter().collect::<HashSet<_>>().len(), 3);
                let correct = game.choices.iter().position(|&choice| choice == answer).unwrap();
                assert_eq!(game.advance(), 0);
                if i % ROUND_SIZE == 0 {
                    assert_eq!(game.stars, 0);
                    let wrong = (correct + 1) % 3;
                    assert_eq!(game.choose(wrong), 1);
                    assert_eq!(game.choose(wrong), 0);
                }
                assert_eq!(game.choose(correct), 2);
                assert_eq!(game.choose(correct), 0);
                assert_eq!(game.stars, i % ROUND_SIZE);
                let expected = if i + 1 == COUNT { 3 } else if (i + 1) % ROUND_SIZE == 0 { 2 } else { 1 };
                assert_eq!(game.advance(), expected);
            }
        }
    }
}
