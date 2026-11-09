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
for key, place, city in US:
    w = dict(id="S-" + key, leaderId="", title=place + " walk", place=place, city=city,
             find="", parking="", shorter="", spots=20,
             description="A Resilient Healers walk at " + place + " is coming soon. We're looking for a local walk leader to set the date, time and meeting spot.")
    w.update(photo_fields(key))
    walks.append(w)

lake = photos["lake-murray"]
data = dict(walks=walks, photos=[dict(walkId="lake-murray-2026-12-13", photo=lake["url"], photoCredit=lake["credit"], photoSource=lake["page"], city="La Mesa, CA")])

block = "const SAMPLE_DATA = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n"
(here.parent / "apps-script" / "SampleData.gs").write_text(block)
print(len(walks), "sample walks")
