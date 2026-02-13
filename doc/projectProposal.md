**Flight Reliability Analysis Application**

## **Project Summary**

Flight Reliability Analysis Application (FRAA) will be a Dockerized database application that will allow the end user to inspect and analyze airline data. The airline data we will be utilizing is the official U.S. Bureau of Transportation Statistics’ datasets. As such, the application will allow users to filter and compare various metrics across airports, airline carriers, time periods, and delays. By combining the airline datasets relationally with an interactive visualization, our application will be able to transform the raw data that the federal government offers into meaningful analytics.   
The problem we aim to address and solve is the limited tools that allow an end user to analyze data from the aviation industry. On the U.S. Bureau of Transportation Statistics' website, there are a handful of dashboards that are offered that take a long time to render and only provide static visualizations. Our goal is to create an application that allows the end user to generate a query through the selection of criteria boxes that will result in multiple comparisons and then provide a final visual result through heatmaps. Our application’s database system will combine and integrate a fact table of flight performance records with some normalized aviation support tables in order to ensure real-world applicability.

**Creative Component**  
FRAA will include dynamic visualizations that generate heatmaps and analytics based on user-selected filters on the web application. Components of our application will support dynamic grouping by airlines, weighted averages of total flights, and real-time updates. Our application will also utilize SQL queries and transform the results into interactive Plotly visualizations, which will be the main creative component of this application. 

**Usefulness**  
The application will aim to be useful in providing information flexibly and ultimately allow the end user to independently explore aviation data and patterns. This is beneficial for those who want to find potential correlations in aviation data with ease. As such, users will be able to compare airlines over time, identify any airports with many delays, identify causes of delays, and explore other trends that may appear.  
There are similar tools and resources that the federal government offers, but they tend to be very limited in their filtering and displaying of data. Our application will aim to be useful by allowing many comparisons within a single relational database framework.

**Realness (Data Sources)**  
Our datasets come from the Bureau of Transportation Statistics (BTS) and the TranStats Aviation Database. Both datasets are in csv format. The BTS dataset has over 590,000 entries and over 100 attributes, and the largest table in the TranStats Aviation Database tables contains over 20,000 entries and 32 attributes. The BTS dataset captures flight records for U.S. certified air carriers from 2018-2025 and contains information such as airline identifiers, scheduled and actual departure and arrival times, detailed causes of delays, and much more. The TranStats Aviation Database will be used as support tables to extract metadata, such as historical carrier codes, airport geographic coordinates, aircraft manufacturer information, and geographic classification information.

**Functionality Description**   
	**User Interaction**  
The end user will be able to interact with the application directly through a web browser interface. As such, the user will be able to select a specific airline, start and destination airports, date, and delay type. The application will perform SQL queries based on the user’s selection input and then generate the necessary interactive visualizations.  
	**CRUD Operations**  
Create: The user can create custom configs for their analysis through selected filters and criteria.  
Read: The user will be able to retrieve and view a collection of flight data and summaries of airlines and airports.  
		Update: The user can modify each individual query they make.  
		Delete: The user can delete an individual query they make.  
		Search: The user can search for an airline or airport by its specific code or name.  
**Tech Stack**  
Containerization and Deployment: **Docker** and **Docker Compose**. Docker is used for the app to be containerized and reproducible across machines. Docker compose for multi-container (PostgreSQL, Backend, Frontend)  
Database: **PostgreSQL** for our database system. This will be our bulk CSV querying. It’s industry standard and is already strongly optimized for our massive dataset.  
Backend: **Python** and **Plotly** for our data processing and visualization. Python has **Pandas** and **NumPy** for any necessary transformations, while **Plotly** will be our source of heatmap visualizations of our data. **Photon** for addresses on **OpenStreetMaps**.  
Frontend: **React** and **TypeScript** should be enough for our UI components. There are many templates already that we can use and adapt on the go if necessary. **Leaflet \- OpenStreetMaps** for rendering our map display.  
	**Low-Fidelity UI Mockup**

Left Sidebar: A filter panel for the different conditions and criteria the user wants to select. This will include dropdowns for airlines, airports, dates, delays, etc. Also, checkboxes for other miscellaneous filters.  
Center: The main visualization area will be the center of the screen. This is where we integrate our heatmap that will display the relevant data the user selects based on the left sidebar.  
A Pop-up window or a Slim Bar: A summary of stats page that will show a more comprehensive breakdown of what the heatmap is showing, such as percentages, averages, or what data is exactly displayed with color codes.  
A rough draft will be included in the GitHub docs/ directory.

**Project Work Distribution**  
Kayetan Jarzabek (kayetan2): Database design. Data selection. Backend and Frontend implementation.	  
Rachel Li (rli60): Frontend development and visualization  
Noah Zhang (noah7): Frontend development, Database design, Data visualization pipelines  
Gokul Sriramasubramanian (gokul2): Data visualization pipelines, Data queries, Backend development