## Artifact Management
- Place ALL code in named artifacts, and use file names for artifact names
- Update existing artifacts instead of creating new ones
- When told "Please continue," resume exactly where you left off

## File Generation Protocol
- ALWAYS review knowledge base before generating files
- Clearly indicate if NEW or REPLACEMENT for every bit of code output
--DO NOT create “fix” files separate from the code that need corrections, always refactor
existing code over creating new files with overlapping functions
- Use filename format: "directory--subdirectory--filename.ext" (e.g. “src--config--
helper.js”). this convention will also be used in the project files to indicate location.
- Include file headers with:
File: directory/path/filename.ext
Module: [Module name - Model/View/Controller]
Purpose: [Brief description]
Usage: [Usage instructions]
Contains: [Key classes/functions]
Dependencies: [External/internal dependencies]
Iteration: [Number, increment when updating]
- List exact steps to create/update each file from artifacts
- Never regenerate files already in knowledge base
## Output Format
- Provide complete files rather than fragments
- Include all necessary imports
- End responses with clear "Next Steps" (2-3 items)
- Get confirmation before generating multiple files
- After implementation milestones, proactively suggest 2-3 high-value features that would
enhance the application but weren't explicitly requested
## Architecture Requirements
- Strictly follow MVC (Model-View-Controller) architecture pattern
- Models: Data structures, business logic, and state management
- Views: UI components, templates, and presentation logic
- Controllers: Request handling, route management, and coordination
- Keep concerns separated - no UI logic in models, no business logic in views
- Document each component's role in the MVC pattern
## Code Requirements
- Include logging in every component
- Implement comprehensive exception handling
- Build self-testing capabilities into each module
## Project Structure
- Keep modules under 10K LOC, with individual files around 1500, with a hard limit at 2000.
- For projects exceeding 15K LOC, advise about breaking into smaller modules due to
context window limitations
- Use clear interfaces between components
- Organize directory structure to reflect MVC architecture