"""Builds the SAMPLE_DATA block for apps-script/Code.gs from data/photos.json.

Sample walks are demo content only. Every one is marked "Sample" in the Sheet,
and removeSamples() in the script deletes them all.
"""
import json, pathlib

here = pathlib.Path(__file__).parent
photos = {p["id"]: p for p in json.loads((here / "photos.json").read_text())}

SD = [
  dict(id="sd-balboa", title="Balboa Park garden walk", date="2027-01-10", place="Balboa Park, at the Lily Pond", city="San Diego, CA",
       address="1549 El Prado, San Diego, CA 92101",
       find="Meet at the south end of the Lily Pond, facing the Botanical Building.",
       parking="Free parking lots around the park, including the Organ Pavilion lot.",
       shorter="Loop back at the Spreckels Organ Pavilion.",
       description="An easy, shaded loop past the Lily Pond, the Botanical Building and the gardens along El Prado. Walk at a conversational pace with other healthcare workers, then stay for a few minutes of conversation by the pond."),
  dict(id="sd-missionbay", title="Mission Bay bayside walk", date="2027-02-14", place="Tecolote Shores, Mission Bay", city="San Diego, CA",
       find="Meet at the Tecolote Shores parking lot, by the restrooms nearest the bayside path.",
       parking="Free lot at Tecolote Shores.",
       shorter="Turn back at the halfway point. The path is flat and paved.",
       description="A flat, paved out-and-back along the water at Mission Bay. Good for every pace, with bay views the whole way and plenty of room to walk side by side."),
  dict(id="sd-miramar", title="Lake Miramar walk", date="2027-03-14", place="Lake Miramar, main parking lot", city="San Diego, CA",
       find="Meet at the main parking lot near the boat launch, off Scripps Lake Drive.",
       parking="Lot off Scripps Lake Drive.",
       shorter="Turn back at the dam for a shorter out-and-back.",
       description="A walk along the paved road that circles Lake Miramar, with open water and hill views. Quiet in the morning and easy to follow."),
  dict(id="sd-coronado", title="Coronado bayfront walk", date="2027-04-11", place="Coronado Ferry Landing", city="Coronado, CA",
       address="1201 1st St, Coronado, CA 92118",
       find="Meet by the ferry dock entrance at the Ferry Landing.",
       parking="Street parking nearby. Arrive a little early on weekends.",
       shorter="Turn back at Centennial Park.",
       description="A waterfront walk along the bay with views across to the downtown San Diego skyline. Flat and paved, with benches along the way."),
  dict(id="sd-liberty", title="Liberty Station waterfront walk", date="2027-05-09", place="NTC Park at Liberty Station", city="San Diego, CA",
       find="Meet on the park's central lawn, by the boat channel.",
       parking="Free parking lots at Liberty Station.",
       shorter="Stay within the park for a short loop.",
       description="A relaxed walk through NTC Park and along the boat channel at Liberty Station, with wide paths, grass and water views."),
]

US = [
  ("boston", "Charles River Esplanade", "Boston, MA"), ("nyc", "Central Park Reservoir", "New York, NY"),
  ("philly", "Schuylkill River Trail", "Philadelphia, PA"), ("baltimore", "Inner Harbor Promenade", "Baltimore, MD"),
  ("dc", "National Mall", "Washington, DC"), ("pittsburgh", "Point State Park", "Pittsburgh, PA"),
  ("cleveland", "Edgewater Park", "Cleveland, OH"), ("columbus", "Scioto Mile", "Columbus, OH"),
  ("cincinnati", "Smale Riverfront Park", "Cincinnati, OH"), ("detroit", "Detroit RiverWalk", "Detroit, MI"),
  ("chicago", "Lincoln Park", "Chicago, IL"), ("milwaukee", "Lakeshore State Park", "Milwaukee, WI"),
  ("minneapolis", "Lake Harriet", "Minneapolis, MN"), ("stlouis", "Forest Park", "St. Louis, MO"),
  ("kc", "Loose Park", "Kansas City, MO"), ("indy", "White River State Park", "Indianapolis, IN"),
  ("louisville", "Waterfront Park", "Louisville, KY"), ("nashville", "Centennial Park", "Nashville, TN"),
  ("memphis", "Shelby Farms Park", "Memphis, TN"), ("atlanta", "Piedmont Park", "Atlanta, GA"),
  ("charlotte", "Freedom Park", "Charlotte, NC"), ("raleigh", "Dorothea Dix Park", "Raleigh, NC"),
  ("richmond", "Maymont", "Richmond, VA"), ("jacksonville", "Southbank Riverwalk", "Jacksonville, FL"),
  ("orlando", "Lake Eola Park", "Orlando, FL"), ("tampa", "Bayshore Boulevard", "Tampa, FL"),
  ("miami", "South Pointe Park", "Miami Beach, FL"), ("nola", "City Park", "New Orleans, LA"),
  ("houston", "Hermann Park", "Houston, TX"), ("dallas", "White Rock Lake Park", "Dallas, TX"),
  ("austin", "Lady Bird Lake", "Austin, TX"), ("sanantonio", "Brackenridge Park", "San Antonio, TX"),
  ("okc", "Lake Hefner", "Oklahoma City, OK"), ("denver", "Washington Park", "Denver, CO"),
  ("slc", "Liberty Park", "Salt Lake City, UT"), ("abq", "Tingley Beach", "Albuquerque, NM"),
  ("phoenix", "Encanto Park", "Phoenix, AZ"), ("tucson", "Reid Park", "Tucson, AZ"),
  ("vegas", "Sunset Park", "Las Vegas, NV"), ("la", "Echo Park Lake", "Los Angeles, CA"),
  ("irvine", "William R. Mason Regional Park", "Irvine, CA"), ("sacramento", "McKinley Park", "Sacramento, CA"),
  ("sf", "Crissy Field", "San Francisco, CA"), ("sanjose", "Guadalupe River Park", "San Jose, CA"),
  ("portland", "Tom McCall Waterfront Park", "Portland, OR"), ("seattle", "Green Lake Park", "Seattle, WA"),
  ("boise", "Julia Davis Park", "Boise, ID"), ("honolulu", "Kapiolani Park", "Honolulu, HI"),
  ("anchorage", "Delaney Park Strip", "Anchorage, AK"), ("omaha", "Memorial Park", "Omaha, NE"),
]

# Ten "model cities" with a fictional sample walk leader, a scheduled sample walk and one sample review.
# Every name, credential and quote here is invented for the demo and is labeled "Sample" on the site.
MODEL = {
  "boston": dict(leader=dict(name="Dana Whitfield, RN", background="Emergency nurse and certified health coach",
                  bio="Dana has worked in emergency nursing for 14 years. She started walking with coworkers after long night shifts and found it was the one hour of the week that reset her. She keeps the pace easy and the conversation open."),
                 walk=dict(date="2027-01-16", start="08:30", end="10:00", repeats="Monthly, third Saturday",
                  find="Meet in front of the Hatch Shell, on the river side.", parking="Street parking on Storrow Drive side streets is limited; the MBTA Charles/MGH stop is a short walk.",
                  shorter="Turn back at the Longfellow Bridge.", description="A flat loop along the Charles River Esplanade with river views the whole way. Easy pace, plenty of benches, and time to talk with people who get it."),
                 review=dict(name="Kendra", role="ICU nurse", rating=5, date="2026-10",
                  text="I almost didn't come because I was so tired. I'm glad I did. Dana made it easy to talk, or not talk, and I left feeling lighter than I had in weeks.")),
  "nyc": dict(leader=dict(name="Marisol Vega, LCSW", background="Hospital social worker",
                  bio="Marisol supports patients and families on a busy medical floor. She leads walks because the people who care for others rarely get a moment to be cared for themselves."),
                 walk=dict(date="2027-01-23", start="09:00", end="10:30", repeats="Monthly, fourth Saturday",
                  find="Meet at Engineers' Gate, Fifth Avenue at East 90th Street.", parking="Street parking is hard; the 86th Street subway stations are close.",
                  shorter="Walk half the loop and cut across at the 86th Street transverse.", description="One gentle loop around the Central Park Reservoir, about 1.6 miles, with skyline views across the water."),
                 review=dict(name="Andre", role="Respiratory therapist", rating=5, date="2026-09",
                  text="Walking with other healthcare workers was different from any support group I've tried. Nobody needed anything explained.")),
  "chicago": dict(leader=dict(name="Grace Okafor, DPT", background="Physical therapist",
                  bio="Grace helps patients get moving again after surgery and injury. Outside work, she believes walking outdoors is the simplest way to clear your head."),
                 walk=dict(date="2027-02-06", start="09:00", end="10:15", repeats="Monthly, first Saturday",
                  find="Meet at the south entrance to the Nature Boardwalk, by the pond.", parking="Paid lots near the zoo; several bus lines stop on Clark Street.",
                  shorter="Stay on the boardwalk loop around the pond.", description="A relaxed walk around the Lincoln Park Nature Boardwalk and lakefront paths, with the skyline peeking through the trees."),
                 review=dict(name="Teresa", role="Medical assistant", rating=5, date="2026-10",
                  text="Grace kept it relaxed and welcoming. I met two people from my own hospital I'd never talked to before.")),
  "atlanta": dict(leader=dict(name="Tamara Hughes, FNP", background="Family nurse practitioner",
                  bio="Tamara works in primary care and knows how heavy the work can feel. Her walks are about breathing room, good company and a little sunshine."),
                 walk=dict(date="2027-01-17", start="08:30", end="10:00", repeats="Monthly, third Sunday",
                  find="Meet at the 12th Street gate, just inside the park.", parking="Paid parking at the Piedmont Park garage; MARTA Midtown station is nearby.",
                  shorter="Loop around Lake Clara Meer only.", description="A loop through Piedmont Park's meadows and around Lake Clara Meer, with Midtown's skyline over the water."),
                 review=dict(name="Bianca", role="Labor and delivery nurse", rating=4, date="2026-09",
                  text="Lovely route and a kind group. I wish it were every week instead of once a month.")),
  "nashville": dict(leader=dict(name="Ellen Brooks, RRT", background="Respiratory therapist",
                  bio="Ellen has spent two decades at the bedside helping people breathe easier. These walks are her way of helping her colleagues do the same."),
                 walk=dict(date="2027-02-13", start="09:00", end="10:00", repeats="Monthly, second Saturday",
                  find="Meet on the front steps of the Parthenon.", parking="Free parking along the park roads.",
                  shorter="Stay on the paved loop around Lake Watauga.", description="An easy walk past the Parthenon and around Lake Watauga in Centennial Park, mostly flat and paved."),
                 review=dict(name="Chris", role="Pharmacy technician", rating=5, date="2026-10",
                  text="Ellen remembered everyone's name by the end. It felt like a group of friends, even on my first time.")),
  "austin": dict(leader=dict(name="Leah Morales, PharmD", background="Hospital pharmacist",
                  bio="Leah spends her days behind the pharmacy counter at a busy hospital. She started leading walks to get herself, and her coworkers, outside and away from screens."),
                 walk=dict(date="2027-01-30", start="08:00", end="09:30", repeats="Monthly, last Saturday",
                  find="Meet at the start of the Boardwalk, shown on the map.", parking="Paid parking nearby on weekends; arrive a little early.",
                  shorter="Turn back at the midpoint of the Boardwalk.", description="A morning walk along the Lady Bird Lake Boardwalk, with water on one side and downtown Austin ahead."),
                 review=dict(name="Monica", role="Clinical pharmacist", rating=5, date="2026-09",
                  text="Exactly what I needed after a hard stretch at work. Easy pace, beautiful views, and nobody made small talk feel forced.")),
  "denver": dict(leader=dict(name="Kate Lindqvist, MD", background="Family physician",
                  bio="Kate is a family doctor who learned the hard way that you can't pour from an empty cup. She leads walks for anyone in healthcare who needs to refill theirs."),
                 walk=dict(date="2027-02-20", start="09:00", end="10:30", repeats="Monthly, third Saturday",
                  find="Meet in front of the Boathouse on Smith Lake.", parking="Free street parking around the park.",
                  shorter="Loop around Smith Lake only.", description="A loop around Washington Park's two lakes, with flower gardens and mountain views on clear days."),
                 review=dict(name="Jordan", role="Paramedic", rating=5, date="2026-10",
                  text="I'm not usually a group person, but this was low-key and genuine. Kate created space without forcing anything.")),
  "seattle": dict(leader=dict(name="Naomi Sato, RN", background="Oncology nurse and yoga teacher",
                  bio="Naomi has been an oncology nurse for eleven years and teaches gentle yoga on weekends. Her walks end with a few minutes of quiet stretching by the water."),
                 walk=dict(date="2027-01-24", start="09:30", end="11:00", repeats="Monthly, fourth Sunday",
                  find="Meet outside the Green Lake Community Center.", parking="Free lots around the lake fill up on weekends.",
                  shorter="Walk half the loop and cut back on the inner path.", description="The flat 2.8-mile path around Green Lake, ending with a few minutes of gentle stretching."),
                 review=dict(name="Ana", role="Hospice nurse", rating=5, date="2026-10",
                  text="The stretching at the end was a lovely touch. Naomi is calm and warm, and I've been back three times.")),
  "sf": dict(leader=dict(name="Rachel Kim, PA-C", background="Physician assistant",
                  bio="Rachel works in urgent care, where every day moves fast. Her walks are intentionally slow, with the bay and the Golden Gate Bridge as company."),
                 walk=dict(date="2027-02-07", start="09:00", end="10:30", repeats="Monthly, first Sunday",
                  find="Meet by the Crissy Field Center, on the Mason Street side.", parking="Free lots along the beach fill up by mid-morning.",
                  shorter="Turn back at the beach halfway along.", description="A flat walk along the Crissy Field promenade toward the Golden Gate Bridge, with the bay beside you."),
                 review=dict(name="Elena", role="ER physician", rating=5, date="2026-09",
                  text="Seeing the bridge come out of the fog while talking with people who understand the job was something I didn't know I needed.")),
  "portland": dict(leader=dict(name="Joanne Fairley, CMA", background="Medical assistant and mindfulness coach",
                  bio="Joanne has worked as a medical assistant for fifteen years and became a certified mindfulness coach after her own brush with burnout."),
                 walk=dict(date="2027-01-09", start="10:00", end="11:15", repeats="Monthly, second Saturday",
                  find="Meet at the Salmon Street Springs fountain.", parking="Paid garages nearby; MAX light rail stops a few blocks away.",
                  shorter="Turn back at the Hawthorne Bridge.", description="An easy riverside walk through Tom McCall Waterfront Park, beautiful in every season and stunning when the cherry trees bloom."),
                 review=dict(name="Sam", role="Dental hygienist", rating=4, date="2026-10",
                  text="Peaceful and well organized. I left with a couple of breathing exercises I still use before work.")),
}

def photo_fields(key):
    p = photos[key]
    return dict(lat=p["lat"], lng=p["lng"], photo=p["url"], photoCredit=p["credit"], photoSource=p["page"])

walks = []
for s in SD:
    key = s["id"]
    w = dict(s)
    w.update(id="S-" + key, leaderId="L-priya", start="09:00", end="10:30", repeats="One time", spots=20)
    w.update(photo_fields(key))
    walks.append(w)
leaders, reviews = [], []
for key, place, city in US:
    w = dict(id="S-" + key, leaderId="", title=place + " walk", place=place, city=city,
             find="", parking="", shorter="", spots=20,
             description="A Resilient Healers walk at " + place + " is coming soon. We're looking for a local walk leader to set the date, time and meeting spot.")
    if key in MODEL:
        m = MODEL[key]
        lid = "L-sample-" + key
        leaders.append(dict(id=lid, city=city, **m["leader"]))
        w.update(leaderId=lid, spots=15, **m["walk"])
        reviews.append(dict(id="R-sample-" + key, leaderId=lid, walkId=w["id"], **m["review"]))
    w.update(photo_fields(key))
    walks.append(w)

lake = photos["lake-murray"]
data = dict(walks=walks, leaders=leaders, reviews=reviews, photos=[dict(walkId="lake-murray-2026-12-13", photo=lake["url"], photoCredit=lake["credit"], photoSource=lake["page"], city="La Mesa, CA")])

block = "const SAMPLE_DATA = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n"
(here.parent / "apps-script" / "SampleData.gs").write_text(block)
print(len(walks), "sample walks,", len(leaders), "sample leaders,", len(reviews), "sample reviews")
