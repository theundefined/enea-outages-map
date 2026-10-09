from update_data import extract_poznan_segment, parse_addresses_from_description


def poznan_streets(description):
    return sorted(parse_addresses_from_description(extract_poznan_segment(description)))


def test_other_town_with_poznanska_street_is_skipped():
    description = (
        "Gmina Dopiewo miejscowość Zakrzewo ul. Gajowa od 13B do 41 nr nieparzyste, "
        "ul. Krótka cała, ul. Poznańska od 2 do 9, ul. Przemysłowa 2, ul. Magazynowa 3, 5,"
    )
    assert extract_poznan_segment(description) == ""


def test_armii_poznan_street_is_not_a_locality():
    assert extract_poznan_segment("Miasto Oborniki ul. Mostowa 4A, ul. Armii Poznań 27") == ""
    assert extract_poznan_segment("Luboń ul. 3 Maja, ul. Armii Poznań, ul. Cicha.") == ""


def test_only_the_poznan_part_of_a_multi_town_description_is_used():
    description = (
        "Gmina Rokietnica miejscowość Kiekrz ul. Portowa 2, 8, \n"
        "miejscowość Rogierówko ul. Portowa cała, ul. Kwaśniewskiej cała, ul. Bojerowa 30, 32, \n\n"
        "Miasto Poznań ul. Portowa, ul. Kwaśniewskiej, ul. Białoszyńskiego 1, 3."
    )
    assert poznan_streets(description) == ["białoszyńskiego", "kwaśniewskiej", "portowa"]


def test_neighbouring_town_after_poznan_is_cut_off():
    description = (
        "Poznań: ul. Turystyczna od 1 do 9 nieparzyste, ul. Chojnicka od 100 do 108 parzyste. "
        "/ Kiekrz: ul. Poznańska 2, 4, ul. Altanowa od 1 do 9 nieparzyste."
    )
    assert poznan_streets(description) == ["chojnicka", "turystyczna"]


def test_poznan_after_other_towns_in_a_list():
    description = "Luboń ul. Cmentarna, ul. Graniczna, Komorniki ul. Ogrodowa, Poznań ul. Opłotki, ul. Uradzka."
    assert poznan_streets(description) == ["opłotki", "uradzka"]


def test_poznan_after_introductory_text():
    description = "Na czas podłączenia agregatu wystąpią przerwy w miejscowości: Poznań: ul. Jarzębowa, ul. Opolska 58"
    assert poznan_streets(description) == ["jarzębowa", "opolska"]


def test_squares_markets_and_bare_streets():
    assert poznan_streets("Poznań pl. Wolności, ul. 27 Grudnia.") == ["27 grudnia", "plac wolności"]
    assert poznan_streets("Poznań rynek Wildecki, ul. Górna Wilda.") == ["górna wilda", "rynek wildecki"]
    assert poznan_streets("Poznań ulica Opolska, ulica Gliwicka") == ["gliwicka", "opolska"]
    assert poznan_streets("Poznań: Lelewela 56, od 80 do 96 parzyste, ul. Kołłątaja od 53 do 79") == ["kołłątaja", "lelewela"]
