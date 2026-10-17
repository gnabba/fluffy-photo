# Race car photo search

Find race car photos in a photographer's folder by asking in natural language, then download the ones you want.

## Language

**Library**:
The single flat folder of Photos the app works on.
_Avoid_: Directory, dataset, archive

**Photo**:
One original image file in the Library, as delivered by the photographer.
_Avoid_: Image, picture, file

**Sidecar**:
The metadata extracted from a Photo (race numbers, sponsors, livery, scene, description), stored next to it.
_Avoid_: Metadata file, index entry

**Search**:
One natural-language request from the user that yields the Photos matching it, or none.
_Avoid_: Query, prompt, lookup

**Candidate**:
A Photo whose Sidecar loosely matches a Search and still has to be reviewed.
_Avoid_: Hit, raw result

**Match**:
A Candidate confirmed after reviewing its Sidecar against the Search, together with a short reason.
_Avoid_: Result, hit

**Selection**:
The Matches of one Search that the user has ticked; each Search has its own.
_Avoid_: Cart, basket, picks

**Export**:
A zip archive of the Photos in one Selection, downloaded by the user.
_Avoid_: Download, bundle
