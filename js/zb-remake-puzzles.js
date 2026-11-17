/* zb-remake-puzzles.js -- the 2015 remake's twelve puzzles: the rule each
   deals at each level, the chances each gives, and how each differs from
   the 1996 program, as text for the Scenario pane's Puzzles section.
   The data:
   ZB_REMAKE_PUZZLES[key], where key is the 1996 puzzle's archive name
   (BRIDGE, TUNNELS, ...), has
     name     the place's 1996 name, as ZB_PLACES has it;
     chances  four strings, one a level, the chances the level gives;
     levels   four arrays of sentences, one a level, the rule the level
              deals and how the remake deals it;
     differs  sentences on what differs from the 1996 program;
     unread   sentences on what the readings leave open;
     source   the workbench note, in doc/remake/, that the text follows.
   Levels here are the game's 1 to 4. The remake's code numbers them 0 to
   3 (DataManager.get_CurrentPuzzleLevel). The trait values have the 1996
   names (ZB_TRAIT_WITH in zb-puzzle.js), since the remake names none.
   WHERE IT CAME FROM
   The workbench's readings of the iPhone build's code (Cpp2IL's dump and
   ISIL of Assembly-CSharp, 16 November 2026) and its stored data, in
   zoombini-workbench/doc/remake/ with REMAKE.md's table. None is checked
   against play.
   - BRIDGE: AllergicCliffsController.SetUpPuzzle, SetupLevel2-4,
     Gatekeeper.CheckZoombini, MAX_ATTEMPTS 6.
   - TUNNELS: StoneColdCavesController.SetUpPuzzle, SetupLevel1-4,
     GetRandomZoombiniTrait; warningThreshold and failureThreshold from two
     static blobs (12 14 16 18 and 16 18 20 22) not tied to their fields.
   - PIZZA: PizzaPassController.StartLevel0-3, AddPizzaToppings,
     AddSundaeToppings, BalanceToppings, GenerateInitialRejectEntrees,
     GenerateTrollReactions; the enums PizzaPass_PizzaToppings and
     PizzaPass_SundaeToppings.
   - FERRY: FerryboatController.Start, OnZoombiniDropped; the four
     BoatConfiguration objects of level16 (stored-data.md).
   - LILLY: ToadsController.PrepareLevel, PrepareGridForDisplay,
     PrepareToads, SwapTiles; TILE_SWAP_COUNT_LVL_1/2/3, LVL_23_WAND_USES,
     LVL_4_WAND_USES, LVL_3/4_CRAB_START_PTS, CRAB_ADD_DELAY_LVL_2/3; the
     ToadsData grids of sharedassets21 (stored-data.md).
   - SLIDES: StoneRiseController.SetupLevelOne-Four, ZoombiniSimilarityMap
     (GetLeastConnectedPair, GetMostConnectedZoombini,
     GetMatchWithLeastConnections, GetMatchWithMostConnections),
     ZoombiniSimilarityInfo.GetRandomAttributeInCommon; VALID_ROWS,
     ODD_ROW_TILES, EVEN_ROW_TILES.
   - FLEENS: FleensController.PreparePuzzle, StartLevel1-3, BuildFleens,
     GetUniqueRandomIntArray.
   - HOTEL: HotelDimensiaController.SetPuzzleRules, InitDoors,
     CountTraitRepresentation, BeginRejectSequence;
     DoorGridController.CanZoombiniEnterDoor; _dayLengthPerLevel 7, 10, 8,
     10 in level18 (stored-data.md).
   - NET: MudballWallGridController.InitializeGrid, PopulateGrid,
     MudballWallAttributeMap.DetermineShift, AddMapping,
     MudballWallController.get_IsHardMode; MudballWallConfigData's table
     in sharedassets14 (stored-data.md).
   - CAVES: LionsLairController.Start, RandomlySelectPartsAndTypes,
     ShowHieroglyphs, ReplaceRandomItemsWith, OnZoombiniDropped;
     VisitedModules.CountTotalVisits(13); the 16 TileMarker spots of
     level13 (stored-data.md).
   - SMOKE: MirrorMachineController.PreparePuzzle,
     MirrorLevel0-3.ConfigureShards, MirrorShard.InitWithRandom,
     StartCyclingAttribute; SHARD_COUNT, ZMB_SHARD_MATCHES,
     CYCLING_ATTRIBUTE_CHANCE.
   - MAZE2: BubblewonderAbyssController.LoadLevelData, PostStart,
     SetupTemplateOne/TwoA/TwoB/Three, Template3SuperSimpleSetup,
     Template3SimplifiedSetupConclusion, ZoombiniAttributePool; the twelve
     BubblewonderAbyssGridData assets of resources.assets (stored-data.md).
   =========================================================================
   Data only. */

const ZB_REMAKE_PUZZLES = {
  BRIDGE: {
    name: 'Allergic Cliffs',
    chances: [
      'Six pegs hold the gate, and each sneeze knocks one out. After the sixth no one else may cross.',
      'Six pegs, as at every level.',
      'Six pegs, as at every level.',
      'Six pegs, as at every level.',
    ],
    levels: [
      ['One trait value, such as a propeller. Zoombinis with it go over one bridge, and the rest go over the other.',
        'The game picks a Zoombini of the band at random, then one of its four traits. The rule is that Zoombini’s value of the trait.',
        'A coin toss sets which bridge is for the Zoombinis with the value.'],
      ['One trait with either of two values, such as a red or a blue nose.',
        'The first value comes from a random Zoombini of the band, as at level 1. The second is another random Zoombini’s value of the same trait.',
        'When the two Zoombinis share the value, the game draws any other value of the trait instead. So the second value may be one that nobody in the band has.'],
      ['Either of two traits’ values, such as sleepy eyes or a cap.',
        'Each value comes from a Zoombini of the band picked at random, and the two traits differ.'],
      ['Any of three traits’ values, such as a tuft, one eye or roller skates.',
        'Each value comes from a Zoombini of the band picked at random, and the three traits differ.'],
    ],
    differs: [
      'The 1996 game counts how many Zoombinis each possible rule sends one way and picks a rule that splits the band near half. The remake does no counting, so a rule may send the whole band over one bridge.',
      'At least one Zoombini always has the first value, because the value comes from a Zoombini of the band.',
      'In 1996 the cliffs pass their level 1 split on to the Stone Cold Caves. The readings found no such link in the remake.',
    ],
    unread: [
      'The readings name the routines that draw a trait and a value but did not read their bodies. That each draws from all five values is an assumption.',
    ],
    source: 'cliffs.md',
  },

  TUNNELS: {
    name: 'Stone Cold Caves',
    chances: [
      'Probably sixteen Zoombinis may be turned back, with rocks starting to fall after twelve.',
      'Probably eighteen Zoombinis may be turned back, with rocks starting to fall after fourteen.',
      'Probably twenty Zoombinis may be turned back, with rocks starting to fall after sixteen.',
      'Probably twenty-two Zoombinis may be turned back, with rocks starting to fall after eighteen.',
    ],
    levels: [
      ['Only the left and right guardians have a rule. It is one trait value, such as a propeller, and it is the value of a Zoombini of the band picked at random.',
        'A coin toss sets which of the two guardians lets through the Zoombinis with the value. The other lets through those without it.',
        'Two of the tunnels, the outer pair or the inner pair, are closed to everyone. A second coin toss picks the pair.'],
      ['The left and right guardians have one trait value, and the upper and lower guardians have a value of a different trait. So each tunnel is for one of four kinds of Zoombini.',
        'Each value is that of a Zoombini of the band picked at random. Coin tosses set which guardian of each pair lets through the Zoombinis with the value.'],
      ['Each pair of guardians has one trait with either of two values, such as a red or a blue nose. The two pairs always use different traits.',
        'Each pair’s first value comes from a random Zoombini of the band. The second is another value of the same trait that someone in the band has.'],
      ['Each pair of guardians has either of two traits’ values, such as sleepy eyes or a cap.',
        'The four values use all four traits, one each. Each is the value of a Zoombini of the band picked at random.'],
    ],
    differs: [
      'The 1996 game scores each possible rule, or pair of rules, by how evenly it sorts the band, and picks among the best. The remake does no scoring, so the four tunnels may get very uneven groups or none at all.',
      'In 1996 the two pairs of guardians may use the same trait. The remake always uses different traits, and at level 4 its four values use all four traits.',
      'In 1996 level 1 avoids the split of the Allergic Cliffs. The readings found no link to the cliffs in the remake.',
    ],
    unread: [
      'The game has two stored sets of counts, 12, 14, 16 and 18 and 16, 18, 20 and 22. The readings could not tie them to the warning and the limit, so the chances above are the likely reading.',
      'Which closed pair goes with which side of the level 1 coin toss.',
      'Which value level 3 gives a pair when the band shows only one value of its trait.',
    ],
    source: 'caves.md',
  },

  PIZZA: {
    name: 'Pizza Pass',
    chances: [
      'Arno forgives six pizzas he does not eat. After that each one costs the Zoombini who carried it.',
      'The trolls forgive seven meals that no troll eats. After that each one costs the Zoombini who carried it.',
      'The trolls forgive seven meals that no troll eats, as at level 2. After that each one costs the Zoombini who carried it.',
      'The trolls forgive seven meals that no troll eats, as at level 2. After that each one costs the Zoombini who carried it.',
    ],
    levels: [
      ['Arno alone, with a pizza. The machine has five toppings, pineapple, peppers, pepperoni, mushrooms and cheese.',
        'Each topping goes on Arno’s order or on no order, with even odds.',
        'When his order has fewer than two, the game moves toppings onto it until it has two.'],
      ['Arno and Willa, each with a pizza and a sundae. The machine has four pizza toppings (no cheese at this level) and two sundae toppings, whipped cream and sprinkles.',
        'Each topping goes to Arno, to Willa or to no order, at 1 in 3 each.',
        'The game then moves toppings until each troll’s order has at least one and the two orders have at least three in all.'],
      ['Three trolls, with all five pizza toppings and the same two sundae toppings.',
        'Each topping goes to one of the three trolls or to no order, at 1 in 4 each.',
        'The game then moves toppings until each troll’s order has at least one and the three orders have at least three in all.'],
      ['Three trolls, with five pizza toppings and three sundae toppings, whipped cream, sprinkles and fudge.',
        'Each topping goes to one of the three trolls at 1 in 3, so every topping is on an order. A troll with an empty order receives one topping from another troll.',
        'Four rejected meals already lie in the pit. They follow the 1996 pattern, each pairing toppings of the longest order with a topping of another troll.'],
    ],
    differs: [
      'In 1996 each topping goes on an order by a draw, round after round, until the orders have enough. The remake deals each topping once, to a troll or to no order at even odds, so far more toppings are on no order at levels 1 to 3.',
      'When a troll’s order is too short, the remake moves the lowest topping, first from those on no order and then from another troll. 1996 moves a random topping from the troll with the longer order.',
      'The pizza deal and the sundae deal each seed their random numbers from the clock. When both run in the same millisecond, the sundae toppings follow the same pattern as the first pizza toppings.',
      'The pizza toppings include pineapple where 1996 has olives. The sundae toppings are whipped cream, sprinkles and fudge, where 1996 has a cherry, whipped cream and chocolate sauce.',
    ],
    unread: [
      'The exact bounds of the step that moves toppings. The minimums above are the likely reading.',
      'Which toppings make the four meals in the pit at level 4.',
      'How a meal passes from one troll to the next, and whether a repeated meal counts again.',
      'The readings found nothing that ends the puzzle before every Zoombini is lost.',
    ],
    source: 'pizza.md',
  },

  FERRY: {
    name: "Captain Cajun's Ferryboat",
    chances: [
      'The readings found no count of wrong tries. A Zoombini that does not fit flies off the raft into the water and is fished out.',
      'As at level 1.',
      'As at level 1.',
      'As at level 1.',
    ],
    levels: [
      ['A Zoombini may sit only where it shares at least one trait (hair, eyes, nose or feet) with every Zoombini seated next to it.',
        'The raft has 16 seats in one chain, a row of seven, three down the side and a row of six, like a U on its side.'],
      ['The same rule, on 16 seats in two rows of eight.'],
      ['The same rule, on 16 seats in four rows of four, each row set a little further right than the row above.'],
      ['The same rule, on 16 seats in four uneven rows of four.'],
    ],
    differs: [
      '1996 picks one of 20 rafts by the level and the band’s size. The remake has one raft for each level, with 16 seats whatever the band’s size.',
      'Nothing in the remake’s deal is random.',
    ],
    unread: [
      'Which seats count as next to each other, and whether level 4 counts the diagonal seats as 1996 does.',
      'Whether a Zoombini that does not fit can be lost.',
    ],
    source: 'ferry.md, stored-data.md',
  },

  LILLY: {
    name: 'Titanic Tattooed Toads',
    chances: [
      'There is no wand.',
      'The wand has 34 swaps, though its gauge shows 30. The show at the start may use the other four.',
      'The wand has 34 swaps, as at level 2.',
      'The wand has 24 swaps, though its gauge shows 20.',
    ],
    levels: [
      ['Which toad crosses from which row is hidden. There are three maps of routes, one each for pad shapes, patterns and colors, each picked from a stored set of four.',
        'The game mirrors each map at random, apart from the other two. Each route’s tattoo is fixed in the stored map, and the twelve toads line up on the bank in a random order.',
        'Some routes break. The game repaints every pad of a broken route with a random value, so the route no longer runs through. How many break depends on the band’s size.'],
      ['As at level 1, and the game then swaps 5 random pairs of pads across the three maps. The player has a wand to swap pads.'],
      ['As at level 2, but one family’s map turns a quarter, so its routes run from the top row down. Crabs walk down them from two places on the top row, and that family’s toads have no route.',
        'The crabs’ family is the shapes, the shapes or patterns, or any of the three, by the band’s size. A new crab comes every 20 seconds.',
        'The game swaps 7 random pairs of pads, in the two maps that are not the crabs’.'],
      ['As at level 3, with crabs from three places on the top row and a new crab every 10 seconds.',
        'The game swaps 10 random pairs of pads, in the two maps that are not the crabs’.'],
    ],
    differs: [
      'The remake picks each family’s map from a stored set and mirrors each map apart from the others. 1996 has one set of three maps and turns or mirrors them together.',
      'Whole routes break. 1996 cuts routes at single pads.',
      'Levels 2 to 4 add random swaps of whole pads, and 1996 has none.',
      'The wand has a fixed number of swaps for each level. In 1996 the number depends on the cuts.',
      'In 1996 the crabs’ family is the shapes for large bands. The remake sets it from a table by the band’s size.',
    ],
    unread: [
      'The table by band size that sets how many routes break and which families the crabs may use. Its values are in static data the readings did not open.',
      'Whether the game picks the four stored maps of each family at random, as the code reading has it, or one for each level, as their number suggests.',
      'Where the crabs start. The code reading puts their starts on the top row, and the stored maps mark them on the pond’s edges.',
      'How many Zoombinis ride each toad, and what the show at the start does with the wand.',
    ],
    source: 'toads.md, stored-data.md',
  },

  SLIDES: {
    name: 'Stone Rise',
    chances: [
      'There is no limit on tries. The player may move the Zoombinis any number of times, and the arrow raises the stones the band satisfies.',
      'There is no limit on tries, as at every level.',
      'There is no limit on tries, as at every level.',
      'There is no limit on tries, as at every level.',
    ],
    levels: [
      ['Pairs, one to a row. Each pair is two stones joined by a stone that shows a trait they share.',
        'The game pairs the band starting from the Zoombini that shares a trait with the fewest others. The joining stone shows a trait drawn at random from those the pair shares.',
        'A Zoombini with no match has a stone to itself.'],
      ['Chains of three, one to a row. The middle stone is for the Zoombini that shares traits with the most others, and the two ends are for its matches that share traits with the fewest.',
        'Zoombinis with no match have stones to themselves. A band of five or fewer has level 1’s pairs instead.'],
      ['Three rings, filled with chains of three and pairs as at level 2. The game starts at one of the rings’ roots, picked at random, and goes around the three in turn.',
        'Stones that no one fills stay empty. A band of five or fewer has level 1’s pairs instead.'],
      ['One network, built outward from the center. The center is for the Zoombini that shares traits with the most others. Next to it go its best-connected match and the second most connected Zoombini.',
        'The game grows the network from there and picks among the open places at random. A band of five or fewer has level 1’s pairs instead.'],
    ],
    differs: [
      'The remake pairs the band by how many others share a trait with each Zoombini. 1996 goes through the band in order.',
      'A joining stone shows a trait drawn at random from those the two Zoombinis share.',
      'Levels 2 to 4 give a band of five or fewer level 1’s pairs. In 1996 only level 4 changes for a small band, to a single chain.',
      'The field is 12 rows of 9 and 8 stones. 1996’s is 13 rows of 9.',
      'The readings found no coin toss for level 4’s look.',
    ],
    unread: [
      'Where level 3’s three rings start, which the code sets when the puzzle starts.',
      'How level 4 grows the network, step by step.',
      'How the game judges a stone.',
      'Whether level 2 builds its chains up to five times, which is the likely reading.',
    ],
    source: 'stonerise.md',
  },

  FLEENS: {
    name: 'Fleens!',
    chances: [
      'The branch where lured Zoombinis wait has a fixed number of places. In 1996 it has six.',
      'The waiting branch has fewer places than at level 1.',
      'The waiting branch has as many places as at level 1.',
      'The waiting branch has as many places as at level 1.',
    ],
    levels: [
      ['A Fleen’s hair, eyes, nose and feet match its Zoombini’s, trait for trait. Each trait’s five values map to the Fleen’s by a random shuffle that always moves at least one value.',
        'The game picks the shuffles again on every visit. The three Fleens on the beehive branch belong to three Zoombinis picked at random.'],
      ['As at level 1, with fewer places on the waiting branch.'],
      ['The traits are mixed as well. The four traits form one cycle, so every Fleen trait matches a different Zoombini trait. For example, the Zoombini’s hair may show as the Fleen’s nose, its nose as the feet, its feet as the eyes and its eyes as the hair.',
        'The values map by a shuffle, as at level 1.'],
      ['Mixed as at level 3. One Fleen trait, picked once, is random for every Fleen and has no link to its Zoombini.'],
    ],
    differs: [
      'In 1996 each trait’s values turn by one of five rotations, and one rotation leaves them as they are. The remake shuffles them in any order but the one they start in.',
      'At levels 3 and 4 every trait moves. In 1996 a trait other than hair may stay as it is.',
      'Level 4’s random trait has no match in 1996.',
      'The remake picks every mapping again on each visit. In 1996 levels 1 and 3 reuse some of them from an earlier visit.',
      'Level 2 has fewer waiting places than level 1. In 1996 every level has six.',
    ],
    unread: [
      'The starting orders of the shuffles. The reading assumes the values and traits in their usual order.',
      'The cycle at levels 3 and 4 is the probable reading of the code, not a certain one.',
      'How many Zoombinis the waiting branch has room for at each level, and what happens when it is full.',
      'What happens with a band of one or two.',
    ],
    source: 'fleens.md',
  },

  HOTEL: {
    name: 'Hotel Dimensia',
    chances: [
      'Seven Zoombinis may be turned away. Each one moves the clock on, and the seventh closes the hotel.',
      'Ten Zoombinis may be turned away, and the tenth closes the hotel.',
      'Eight Zoombinis may be turned away, and the eighth closes the hotel.',
      'Ten Zoombinis may be turned away, and the tenth closes the hotel.',
    ],
    levels: [
      ['One trait, such as the nose. The hotel has five trunks, and each room is for one value of the trait, set by the first Zoombini in it.',
        'The game picks the trait at random. If the band shows all five values of two or more traits, the trait must be one where the band shows at least four values.'],
      ['Two different traits, one for the floor and the other for the trunk, so each room is for one pair of values.',
        'The game picks and tests both traits as at level 1.'],
      ['Two traits for floor and trunk, as at level 2. If the band shows four or more values of two or more traits, both traits must be among those.',
        'The game arranges the band at random to find empty rooms and boards some of them up. The number is from 1 to the number of empty rooms minus 1, and at most 8, so 8 is the commonest number.'],
      ['Three different traits, one each for floor, trunk and hallway. Any three will do, whatever the band.'],
    ],
    differs: [
      'Level 1 tests only the trait it uses. 1996 draws and tests a second trait as well.',
      'Level 3’s count of boarded rooms favors 8. 1996 draws a number from 1 to 8.',
      'The number of Zoombinis turned away is the same as in 1996 at every level.',
    ],
    unread: [
      'How many floors the hotel has at each level. The number is in static data the readings did not open.',
      'The rule at the door, line by line.',
      'Which count the level 1 test reads. The readings inferred it from the code’s layout.',
    ],
    source: 'hotel.md, stored-data.md',
  },

  NET: {
    name: 'Mudball Wall',
    chances: [
      'The tank has 8 mudballs plus half the band, rounded up. A band of 16 has 16.',
      'The same tank as at level 1.',
      'The same tank as at level 1.',
      'The same tank as at level 1.',
    ],
    levels: [
      ['A wall of 5 by 5 sections. The mudball’s color picks the row and its shape picks the column, or the other way around, at random. Each uses an order of the five values picked at random.',
        'The marked sections come from a stored table by band size, with marks of 3, 2 and 1 dots. The dots add up to the band, one for each Zoombini, and the game places the marks at random. A band of 16 has two marks of 3 dots, four of 2 and two of 1.'],
      ['As at level 1, but the values shift by 1 to 4 places, picked at random, from one row or column to the next. So the pattern runs diagonally. A coin toss picks which of two ways the shift runs.'],
      ['A wall of 5 rows and 5 columns, with each column 5 squares wide. The mudball’s color, its shape and the shape’s color each pick one of the three, paired at random. Each uses an order of the five values picked at random.',
        'Nothing shifts at this level.'],
      ['As at level 3, and one of the three directions shifts by 1 to 4 places, both picked at random.'],
    ],
    differs: [
      'The marks and the tank come from a stored table by band size, the same at every level. In 1996 the marks are groups of 3, 2 and 1 taken from the band, and the tank has 8 more mudballs than marks, or 9 more at level 4.',
      'The shift is 1 to 4 places. In 1996 it is 2 or 3.',
      'At level 3 the three choices pair with the three directions at random, as at level 4. In 1996 level 3 fixes the pairing apart from a coin toss between color and shape.',
      'Each choice has an order of its values. At level 3 in 1996 the shape and the shape’s color share one order.',
    ],
    unread: [
      'How the shift enters the wall, and which way each of its two kinds runs. The diagonal pattern is the likely reading.',
      'What the three extra random draws for each mark do.',
    ],
    source: 'mudball.md, stored-data.md',
  },

  CAVES: {
    name: "The Lion's Lair",
    chances: [
      'The lion allows four mistakes.',
      'The lion allows five mistakes.',
      'The lion allows six mistakes.',
      'The lion allows seven mistakes.',
    ],
    levels: [
      ['One trait is picked at random, and its five values are shuffled. The band must stand along the path in groups by that trait, in that order. The wall shows all five values in order.',
        'On the first visit in a saved game, the trait is always the nose. The path has 16 stones at every level.'],
      ['As at level 1, but the wall shows only two of the five values, picked at random, each in its place in the order.'],
      ['Two traits are picked, each with its values shuffled. The band stands in groups by the first trait, and within each group by the second. The wall shows two values of each trait, the first trait on the top row and the second below.'],
      ['As at level 3, probably with nothing on the wall.'],
    ],
    differs: [
      'In 1996 the nose comes first in the first Lion’s Lair after the program starts, at any level. In the remake it comes only at level 1, on the first visit in a saved game.',
      'In 1996 a Zoombini put on a wrong stone moves to a right one and goes on. In the remake it drops away.',
    ],
    unread: [
      'Where a Zoombini put on a wrong stone ends up.',
      'Whether level 4 shows nothing on the wall, as in 1996.',
      'Which stones each Zoombini may stand on.',
    ],
    source: 'lion.md, stored-data.md',
  },

  SMOKE: {
    name: 'Mirror Machine',
    chances: [
      'The game counts no chances. Each Zoombini has one ride.',
      'As at level 1.',
      'As at level 1.',
      'As at level 1.',
    ],
    levels: [
      ['The wall shows eight reflections. Two of them match two different Zoombinis of the band. The other six look like no one in the band and like no other reflection.',
        'The player puts a Zoombini in the cart and a reflection in the mirror.'],
      ['Eight reflections dealt as at level 1, but with one match, and filters on each side of the center crystal. Each filter shows one or two traits.',
        'The matching reflection belongs to a Zoombini of the band picked at random, and its traits under the filters are random.'],
      ['Six filters, each showing one or two traits. A filter may instead move a trait to its next value, probably 70 times in 100.',
        'The deal depends on the Zoombini at the front of the line and on how many carts have gone.'],
      ['As at level 3, with a second reflection and a second ride, as at level 4 in 1996.'],
    ],
    differs: [
      'Level 1 shows two matching reflections, for two Zoombinis. 1996 shows one, for one Zoombini picked at random.',
      'The other reflections never look like a Zoombini of the band or like each other. In 1996 they are random Zoombinis.',
      'At level 3 a filter that moves a trait appears by a draw of a percentage.',
    ],
    unread: [
      'Most of the deal at levels 2 to 4. The readings could name only some of its random draws and did not follow level 4’s deal in detail.',
      'Which part of the code serves which level. The readings take them in order.',
      'What level 1 does for a band of one.',
    ],
    source: 'mirror.md',
  },

  MAZE2: {
    name: 'Bubblewonder Abyss',
    chances: [
      'The game counts no chances. A Zoombini whose bubble falls into a whirlpool does not cross.',
      'As at level 1.',
      'As at level 1.',
      'As at level 1.',
    ],
    levels: [
      ['One of two layouts, picked at random on each visit. Each has one or two whirlpools and one or two exits.',
        'The feature arrows show features picked from the band’s counts, and some show features nobody has.'],
      ['One of two layouts, picked at random. The second has colored squares, which turn the arrows of their color, and deals its features by a different pattern.'],
      ['One of two layouts, picked at random. Both have colored squares and two exits.'],
      ['One of two larger layouts, picked at random, with colored squares, sticky squares and two or three exits.',
        'The arrows start from the band’s rarest feature, then go on to the rarest left among the other Zoombinis.',
        'When the band runs out of different features, the game falls back to a simpler version of the layout, and some arrows may show features nobody has.'],
    ],
    differs: [
      '1996 uses each level’s two layouts in turn. The remake picks one at random each time.',
      '1996 has a third layout at level 4 for a band of fewer than five. The remake falls back to a simpler grid when the band runs short of different features.',
      'The remake ties each feature to a named role on the layout’s squares. 1996 fills the arrows in the order the layout gives.',
    ],
    unread: [
      'The exact dealing patterns at levels 2 and 3.',
      'The source of the colors. The readings found no match for the 1996 color shuffle.',
      'What each role means, square by square.',
    ],
    source: 'abyss.md, stored-data.md',
  },
};

if (typeof module !== 'undefined') module.exports = { ZB_REMAKE_PUZZLES };
