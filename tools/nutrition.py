"""Estimate fiber, total sugars, added sugars and sugar alcohols per serving from a recipe's ingredients.

Each rule: (regex on the lower-cased ingredient name, per-100 g [fiber, sugars, added sugars, sugar alcohols],
grams per cup, grams per piece). First match wins, so specific rules come before generic ones.
Values are typical label / USDA figures; they are estimates, which is how the site labels them.
"""
import re

R = [
    # --- things to ignore (no fiber/sugar or not food) ---
    (r"parchment|baking paper|foil|liners|paper towel|cheesecloth|food colou?r|^ice$|\bwater\b|\bsalt\b|black pepper|cracked pepper|^pepper$|white pepper|cooking spray|oil spray|spray oil|\bspray\b|extract|flavou?ring|baking powder|baking soda|cream of tartar|xanthan|yeast|msg|vinegar(?!.*balsamic)|pickle juice|brine|espresso|coffee|vodka|gelatin|agar", [0,0,0,0], 240, 0),
    # --- sweeteners ---
    (r"sugar-free (maple|pancake)? ?syrup|sugar-free syrup|sugar-free caramel|sugar-free honey", [0,0,0,0], 320, 0),
    (r"liquid monk ?fruit|stevia(?! or)|splenda", [0,0,0,0], 200, 1),
    (r"swerve|erythritol|monk ?fruit|zero-cal|low-cal(orie)? sweetener|sugar substitute|powdered sweetener|brown sugar substitute|zero-calorie brown|sweetener", [0,0,0,99], 200, 0),
    (r"powdered sugar|icing sugar|confectioners", [0,98,98,0], 120, 0),
    (r"brown sugar(?! (substitute|swerve))|turbinado|^sugar$|^sugar,|^sugar \(|granulated sugar|packed brown", [0,98,98,0], 200, 0),
    (r"honey(?! ?crisp)", [0,82,82,0], 340, 0),
    (r"maple syrup|elderberry syrup", [0,60,60,0], 320, 0),
    (r"molasses", [0,75,75,0], 330, 0),
    (r"marshmallow fluff", [0,55,55,0], 120, 0),
    (r"marshmallow", [0,58,58,0], 50, 1),
    (r"hot cocoa mix", [2,70,65,0], 100, 0),
    (r"candy cane|bubble gum$|rainbow candy|sprinkles|m&m", [1,70,70,0], 180, 1),
    # --- chocolate, cookies, candy ---
    (r"cereal milk", [0,6,3,0], 240, 0),
    (r"sugar-free.*chocolate chip|low-sugar chocolate chip|lily", [25,3,0,30], 170, 0),
    (r"cacao powder|cocoa powder|black cocoa", [33,2,0,0], 86, 0),
    (r"cacao nib", [33,0,0,0], 120, 0),
    (r"white chocolate", [0,59,59,0], 170, 0),
    (r"70%|85%|dark chocolate|dark baking chocolate|sea salt dark", [11,24,24,0], 170, 10),
    (r"chocolate frosting", [0,55,55,0], 240, 0),
    (r"chocolate chip|chocolate chunk|milk chocolate|^chocolate$|dairy-free chocolate", [6,48,48,0], 170, 0),
    (r"reese'?s peanut butter cup|reese'?s cup", [3,47,47,0], 0, 17),
    (r"crunch bar", [2,57,57,0], 0, 20),
    (r"mini oreo", [3,38,38,0], 0, 2),
    (r"oreo thin", [3,38,38,0], 0, 4.5),
    (r"oreo|sandwich cookie", [3,38,38,0], 0, 11),
    (r"biscoff (spread|cookie butter)|cookie butter(?! protein)", [1,35,35,0], 260, 0),
    (r"biscoff|shortbread|gingerbread cookie|sugar cookie(?! protein)", [1,38,38,0], 0, 7),
    (r"graham", [3,25,25,0], 85, 14),
    (r"ladyfinger", [1,40,40,0], 0, 6),
    (r"cookie dough", [1,40,40,0], 0, 30),
    (r"protein brownie", [4,15,10,0], 0, 50),
    (r"churro", [2,20,20,0], 0, 30),
    (r"larabar", [5,55,0,0], 0, 45),
    # --- cereals & snacks ---
    (r"cinnamon toast crunch(?! cereal milk)|fruity pebbles(?! cereal)|reese'?s puffs(?! cereal)|your favorite cereal|rice krispies|cornflakes", [3,30,30,0], 35, 0),
    (r"nacho chip|tortilla chip|tostada", [4,1,0,0], 30, 12),
    (r"rice cake", [3,1,0,0], 0, 9),
    # --- pudding / jello / mixes ---
    (r"sugar-free|fat-free sugar-free|jell-o fat-free", [2,0,0,0], 120, 0),  # SF pudding/jello: maltodextrin, ~no sugar
    (r"pudding mix", [1,80,80,0], 120, 0),
    (r"ranch dip mix|taco seasoning|seasoning|bouillon|stock pot|stock powder", [10,8,4,0], 100, 0),
    # --- sauces & condiments ---
    (r"sugar-free ketchup|no-sugar.*ketchup|low-sugar ketchup|reduced-s?ugar ketchup", [0,4,0,0], 240, 0),
    (r"ketchup", [0,22,18,0], 240, 0),
    (r"no-sugar-added bbq", [1,5,0,0], 240, 0),
    (r"bbq sauce", [1,40,36,0], 240, 0),
    (r"hoisin", [3,35,30,0], 240, 0),
    (r"gochujang", [3,20,15,0], 240, 0),
    (r"sriracha|chili crisp|hot sauce|buffalo|redhot", [1,15,10,0], 240, 0),
    (r"balsamic glaze", [0,40,30,0], 240, 0),
    (r"enchilada sauce|pizza sauce|passata|tomato sauce|marinara|salsa|pico", [2,4,1,0], 240, 0),
    (r"tomato paste", [4,12,0,0], 260, 0),
    (r"teriyaki|sweet chili", [0,45,40,0], 240, 0),
    (r"mustard", [3,1,0,0], 240, 0),
    (r"mayo|aioli", [0,1,0,0], 230, 0),
    (r"pesto", [2,1,0,0], 240, 0),
    (r"relish", [1,20,15,0], 240, 0),
    (r"nacho cheese sauce", [0,3,1,0], 240, 0),
    (r"taco bell sauce", [1,10,6,0], 240, 0),
    (r"soy sauce|worcestershire|fish sauce|miso", [1,3,2,0], 240, 0),
    (r"tahini", [9,0,0,0], 240, 0),
    (r"apple pie filling|pie filling", [1,25,20,0], 260, 0),
    (r"pumpkin pie(?! spice)|apple pie$|pumpkin pie$", [1,25,20,0], 0, 30),
    # --- dairy ---
    (r"egg white powder|protein powder|whey|casein|protein mix-in|protein flour|scoops? .*protein", [2,4,0,0], 120, 31),
    (r"pb2|powdered peanut|peanut butter powder", [8,10,6,0], 64, 0),
    (r"peanut butter|almond butter|cashew butter|nut butter", [6,9,3,0], 258, 0),
    (r"almond milk|oat milk|coconut milk(?! canned)|soy milk", [0.5,0.3,0,0], 240, 0),
    (r"canned full-fat coconut milk|coconut milk", [0,2,0,0], 240, 0),
    (r"protein shake|chocolate milk", [1,5,3,0], 240, 0),
    (r"oikos pro yogurt drink", [0,4,0,0], 240, 0),
    (r"eggnog", [0,20,15,0], 240, 0),
    (r"vanilla greek yogurt|whole-milk vanilla greek|flavored yogurt|toasted coconut vanilla", [0,8,5,0], 245, 0),
    (r"greek yogurt|yogurt|skyr|labneh", [0,3.5,0,0], 245, 0),
    (r"cottage cheese", [0,3,0,0], 225, 0),
    (r"cream cheese|laughing cow", [0,3,0,0], 230, 21),
    (r"sour cream|creme fraiche", [0,3,0,0], 230, 0),
    (r"heavy cream|whipping cream|whipped cream", [0,3,0,0], 240, 0),
    (r"evaporated milk", [0,10,0,0], 250, 0),
    (r"fairlife|ultra-filtered|protein milk|skim protein milk|milk50", [0,2.5,0,0], 245, 0),
    (r"buttermilk|warm milk|whole milk|2% milk|skim milk|fat-free milk|fairlife|protein milk|low-fat milk|light milk|high-protein milk|ultra-filtered milk|^milk|skimmed|milk$", [0,4.8,0,0], 245, 0),
    (r"milk powder", [0,52,0,0], 120, 0),
    (r"mozzarella|cheddar|parmesan|parmigiano|pecorino|feta|provolone|swiss|american cheese|cheese|halloumi|ricotta", [0,1,0,0], 110, 25),
    (r"butter(?!milk| ?nut)|ghee|buttery spread", [0,0,0,0], 225, 0),
    (r"egg white|liquid egg", [0,0.7,0,0], 243, 33),
    (r"\begg|eggs\b|hard-boiled", [0,0.4,0,0], 243, 50),
    # --- nuts, seeds, nut butters ---
    (r"chia", [34,0,0,0], 170, 0),
    (r"flax", [27,1.5,0,0], 150, 0),
    (r"hemp", [4,1.5,0,0], 160, 0),
    (r"almond flour|ground almonds", [10,4.4,0,0], 96, 0),
    (r"coconut flour", [39,10,0,0], 112, 0),
    (r"shredded coconut|coconut flakes|toasted coconut", [16,7,0,0], 85, 0),
    (r"almond|pecan|walnut|pistachio|peanut|cashew|hazelnut|mixed nuts|nuts", [9,4,0,0], 140, 1.2),
    (r"sesame", [12,0.3,0,0], 144, 0),
    (r"pumpkin seed|sunflower", [6,1,0,0], 140, 0),
    # --- grains, flours, breads ---
    (r"oat flour", [10,1,0,0], 92, 0),
    (r"oats", [10,1,0,0], 81, 0),
    (r"whole wheat flour", [11,0.4,0,0], 120, 0),
    (r"keto wheat flour", [40,0,0,0], 120, 0),
    (r"vital wheat gluten", [0.6,0,0,0], 120, 0),
    (r"tapioca flour|cornstarch|cornflour", [0.9,3,0,0], 120, 0),
    (r"self-rising flour|all-purpose flour|plain flour|bread flour|^flour|flour$", [2.7,0.3,0,0], 125, 0),
    (r"panko|breadcrumb", [4,6,4,0], 60, 0),
    (r"ole xtreme|xtreme wellness|low-carb|low carb|high-fiber tortilla|high-protein.*(tortilla|wrap)|low-calorie.*(tortilla|wrap)|carb balance|keto.*(tortilla|wrap)", [24,1,0,0], 0, 50),
    (r"tortilla|wrap|pitta|pita", [3,3,2,0], 0, 60),
    (r"bagel", [2.5,6,5,0], 0, 100),
    (r"english muffin", [3,3,2,0], 0, 57),
    (r"brioche|burger bun|\bbuns?\b", [2,10,8,0], 0, 65),
    (r"sourdough|white bread|bread|toast", [3,4,3,0], 0, 40),
    (r"hash brown", [2,0.5,0,0], 0, 60),
    (r"high-fiber pasta|protein pasta|high-protein (rigatoni|penne|fusilli)|chickpea pasta|lentil pasta", [10,3,0,0], 100, 0),
    (r"pasta|spaghetti|linguine|fettuccine|macaroni|rigatoni|penne|paccheri|pappardelle|orzo|noodle|ramen", [3,2.7,0,0], 100, 0),
    (r"riced cauliflower|cauliflower", [2,1.9,0,0], 107, 600),
    (r"kaizen|high-protein rice", [8,1,0,0], 0, 0),
    (r"cooked (white |sushi |jasmine )?rice|mexican rice|jasmine rice|microwave.*rice(?! cauli)", [0.4,0.1,0,0], 160, 0),
    (r"basmati|white rice|uncooked rice|^rice|rice$|brown rice", [1.3,0.1,0,0], 185, 0),
    (r"quinoa", [7,0,0,0], 170, 0),
    # --- legumes ---
    (r"refried beans", [5,0.5,0,0], 250, 0),
    (r"chickpea|borlotti|black beans|kidney|beans|lentil|edamame", [7,1,0,0], 165, 0),
    (r"peas", [5,5.7,0,0], 145, 0),
    (r"sweet corn|corn", [2.4,4.5,0,0], 165, 0),
    # --- fruit ---
    (r"medjool|dates", [7,66,0,0], 175, 24),
    (r"raisin|dried mango|dried fruit", [4,60,0,0], 165, 0),
    (r"banana", [2.6,12,0,0], 150, 118),
    (r"blueberr|berries|raspberr|blackberr", [3,9,0,0], 148, 0),
    (r"strawberr", [2,4.9,0,0], 150, 15),
    (r"mango", [1.6,14,0,0], 165, 0),
    (r"watermelon", [0.4,6.2,0,0], 152, 0),
    (r"pineapple", [1.4,10,0,0], 165, 0),
    (r"apple(?!sauce| pie| purée)|honeycrisp", [2.4,10,0,0], 125, 180),
    (r"applesauce|apple purée", [1.2,10,0,0], 245, 0),
    (r"orange juice|juice of", [0.2,8.4,0,0], 248, 0),
    (r"grapefruit", [1.6,7,0,0], 230, 250),
    (r"oranges?$|orange,|^orange|clementine", [2.4,9,0,0], 180, 130),
    (r"lemon|lime", [0,1.5,0,0], 240, 5),
    (r"avocado(?! oil)", [6.7,0.7,0,0], 150, 150),
    (r"cherr(y|ies)(?! tomato)", [2,25,15,0], 155, 5),
    (r"pomegranate", [4,14,0,0], 174, 0),
    (r"pumpkin purée|pure pumpkin|canned pumpkin|pumpkin$|^pumpkin", [2.9,3.3,0,0], 245, 0),
    (r"butternut|squash", [2,2.2,0,0], 205, 0),
    (r"sweet potato", [3,4.2,0,0], 200, 130),
    (r"potato", [2.2,0.8,0,0], 150, 200),
    # --- vegetables ---
    (r"sun-dried tomato", [12,37,0,0], 55, 0),
    (r"chopped tomatoes|\btin\b|canned tomato|crushed tomato", [1,3.5,0,0], 240, 0),
    (r"tomato", [1.2,2.6,0,0], 180, 120),
    (r"spinach|arugula|rocket|lettuce|romaine|microgreens|kale", [2,0.4,0,0], 30, 10),
    (r"cabbage|slaw|sauerkraut|kimchi", [2.5,3.2,0,0], 70, 0),
    (r"broccoli", [2.6,1.7,0,0], 90, 150),
    (r"carrot", [2.8,4.7,0,0], 110, 60),
    (r"red bell pepper|bell pepper|capsicum|peppers and onions|^peppers|peppers$", [2.1,4.2,0,0], 150, 120),
    (r"jalapeñ|serrano|green chil", [2.8,4,0,0], 90, 14),
    (r"chipotle", [5,4,0,0], 240, 10),
    (r"onion|shallot|scallion|spring onion", [1.7,4.2,0,0], 160, 110),
    (r"garlic(?! powder| granules| salt)", [2.1,1,0,0], 136, 3),
    (r"cucumber|zucchini|courgette|radish", [0.5,1.7,0,0], 120, 200),
    (r"mushroom", [1,2,0,0], 70, 0),
    (r"olive|caper|pickle|gherkin|pepperoncini", [3,0.5,0,0], 135, 7),
    (r"fresh (basil|parsley|mint|cilantro|coriander|herbs|rosemary)|basil|parsley|cilantro|coriander|mint|dill|chives", [3,0.5,0,0], 20, 0),
    (r"chicken|beef|steak|pork|bacon|sausage|turkey|salmon|tuna|mackerel|prawn|shrimp|crab|mortadella|salami|pepperoni|guanciale|anchov|mince|meat", [0,0,0,0], 0, 100),
    (r"powder|ground (cinnamon|cumin|nutmeg|ginger|sumac|cloves|allspice)|paprika|cumin|cinnamon|nutmeg|oregano|herbs|spice|turmeric|sumac|chili|chilli|cayenne", [30,3,0,0], 100, 0),
    # --- meats/fish/oils: no fiber or sugar ---
    (r"oil", [0,0,0,0], 218, 0),
    (r"broth|stock", [0,0.5,0,0], 240, 0),
]
RX = [(re.compile(p), v, cup, each) for p, v, cup, each in R]

UNIT_CUP = {"cup":1, "cups":1, "tbsp":1/16, "tsp":1/48, "ml":1/240, "l":1000/240, "fl_oz":1/8, "pinch":1/768}
UNIT_G = {"g":1, "kg":1000, "oz":28.35, "lb":453.6}
COUNT_HINT = [(r"scoop", 31), (r"slice", 25), (r"handful", 30), (r"packet|pack|sachet", 28), (r"can\b|tin\b", 400), (r"bag", 200), (r"jar", 300)]

def match(name):
    n = name.lower()
    for rx, v, cup, each in RX:
        if rx.search(n): return v, cup, each
    return None

def grams(it, cup, each):
    q, u, name = it.get("q"), (it.get("u") or "").lower(), it["i"].lower()
    if q is None: return 0
    if u in UNIT_G: return q * UNIT_G[u]
    if u in UNIT_CUP: return q * UNIT_CUP[u] * (cup or 120)
    # counts: "2 bananas", "1 scoop protein", "3 slices bread"
    for pat, g in COUNT_HINT:
        if re.search(pat, u + " " + name):
            return q * (each or g)
    return q * (each or 0)

def estimate(r):
    tot = [0.0, 0.0, 0.0, 0.0]; unknown = []
    for g in r["groups"]:
        for it in g["items"]:
            m = match(it["i"])
            if not m: unknown.append(it["i"]); continue
            v, cup, each = m
            gr = grams(it, cup, each)
            for k in range(4): tot[k] += gr * v[k] / 100
    s = max(1, r["servings"])
    fib, sug, add, sa = (x / s for x in tot)
    c = r["macros"]["carbs"]
    fib = min(fib, c); sug = min(sug, c); add = min(add, sug)
    rnd = lambda x: round(x * 2) / 2 if x < 10 else round(x)
    return {"fiber": rnd(fib), "sugar": rnd(sug), "addedSugar": rnd(add), "sugarAlcohol": rnd(sa)}, unknown

NEW = ["fiber", "sugar", "addedSugar", "sugarAlcohol"]
def fill(r):
    """Add any missing fiber/sugar fields to r['macros'] (estimated); keep values already set."""
    est, unknown = estimate(r)
    for k in NEW:
        if k not in r["macros"]: r["macros"][k] = est[k]
    return unknown
