package controllers

import java.io.File

import mimir.Database
import mimir.sql.JDBCBackend
import mimir.web._
import mimir.algebra.{QueryNamer, QueryVisualizer, Type, RowIdPrimitive, Typechecker}
import mimir.sql.{CreateLens, Explain}
import mimir.util.{JSONBuilder}

import com.typesafe.scalalogging.slf4j.LazyLogging

import play.api.mvc._
import play.api.libs.json._
import net.sf.jsqlparser.statement.Statement
import net.sf.jsqlparser.statement.insert.Insert
import net.sf.jsqlparser.statement.select.Select
import net.sf.jsqlparser.statement.update.Update
import net.sf.jsqlparser.statement.delete.Delete
import net.sf.jsqlparser.statement.drop.Drop

/*
 * This is the entry-point to the Web Interface.
 * This class is part of the template provided by the play framework.
 *
 * Each Action, part of the Play API is a function that maps
 * a Request to a Result. Every URL that can be handled by the
 * application is defined in the routes.conf file. Each url
 * has an Action associated with it, which defines what the
 * server should do when the client asks for that URL
 *
 * GET requests pass in args that can be directly extracted
 * from the Action method signatures. POST requests need parsers.
 * For example, if the POST request had form fields attached to
 * it, we use a form body parser
 *
 * Read more about Actions at
 * https://www.playframework.com/documentation/2.0/ScalaActions
 */

class Application extends Controller with LazyLogging {

  /*
   * The Writes interface allows us to convert
   * Scala objects to a JSON representation
   */
  implicit val WebStringResultWrites = new Writes[WebStringResult] {
    def writes(webStringResult: WebStringResult) = Json.obj(
      "result" -> webStringResult.result
    )
  }

  implicit val WebQueryResultWrites = new Writes[WebQueryResult] {
    def writes(webQueryResult: WebQueryResult) = Json.obj(
      "headers" -> webQueryResult.webIterator.header,
      "data" -> webQueryResult.webIterator.data.map(x => x._1),
      "rowValidity" -> webQueryResult.webIterator.data.map(x => x._2),
      "missingRows" -> webQueryResult.webIterator.missingRows,
      "queryFlow" -> webQueryResult.webIterator.queryFlow.toJson().toString()
    )
  }

  implicit val WebErrorResultWrites = new Writes[WebErrorResult] {
    def writes(webErrorResult: WebErrorResult) = Json.obj(
      "error" -> webErrorResult.result
    )
  }

  implicit val WebResultWrites = new Writes[WebResult] {
    def writes(webResult: WebResult) = {
      webResult match {
        case wr:WebStringResult => WebStringResultWrites.writes(wr)
        case wr:WebQueryResult  => WebQueryResultWrites.writes(wr)
        case wr:WebErrorResult  => WebErrorResultWrites.writes(wr)
      }
    }
  }

  implicit val ReasonWrites = new Writes[(String, String)] {
    def writes(tup: (String, String)) = Json.obj("reason" -> tup._1, "lensType" -> tup._2)
  }

  private def prepareDatabase(dbName: String = "ui_demo.db", backend: String = "sqlite"): Database =
  {
    var ret =
      backend match {
        case "sqlite" => new Database(new JDBCBackend(backend, "databases/" + dbName))
        case _        => new Database(new JDBCBackend(backend, dbName))
      }

    try { 
      ret.backend.open() 
      ret.initializeDBForMimir()
    } finally {
      ret.backend.close()
    }
    return ret
  }

  private def handleStatements(input: String): (List[Statement], List[WebResult]) = {

    logger.debug(s"Received query $input")


    val statements = db.parse(input)
    val results = 
    statements.map({
      /*****************************************/           
      case s: Select => {
        val start = System.nanoTime()
        val raw = db.sql.convert(s)
        val rawT = System.nanoTime()
        val results = db.query(raw)
        val resultsT = System.nanoTime()

        println("Convert time: "+((rawT-start)/(1000*1000))+"ms")
        println("Compile time: "+((resultsT-rawT)/(1000*1000))+"ms")

        results.open()
        val wIter: WebIterator = db.generateWebIterator(results)
        try{
          wIter.queryFlow = QueryVisualizer.convertToTree(db, raw)
        } catch {
          case e: Throwable => {
            e.printStackTrace()
            wIter.queryFlow = new OperatorNode("", List(), None)
          }
        }
        results.close()

        new WebQueryResult(wIter)
      }
      /*****************************************/           
      case s: CreateLens =>
        db.update(s)
        new WebStringResult("Lens created successfully.")
      /*****************************************/           
      case s: Explain => {
        val raw = db.sql.convert(s.getSelectBody());
        val op = db.optimize(raw)
        val res = "------ Raw Query ------\n"+
          raw.toString()+"\n"+
          "--- Optimized Query ---\n"+
          op.toString

        new WebStringResult(res)
      }
      /*****************************************/           
      case s: Statement =>
        db.update(s)
        new WebStringResult("Database updated.")
    })
    (statements, results)
  }

  def allDatabases : Array[String] =
  {
    val curDir = new File(".", "databases")
    curDir.listFiles().
      filter( f => f.isFile && f.getName.endsWith(".db")).
      map(x => x.getName)
  }

  def allSchemas: Seq[(String, Seq[(String, Type)])] = {
    db.getAllTables.toList.
      map{ (x) => (x, db.bestGuessSchema(db.getTableOperator(x))) }.
      sortBy(_._1)
  }

  def allVisibleSchemas: Seq[(String, Seq[(String, Type)])] = {
    allSchemas.filter( (x) => { 
      (!x._1.startsWith("MIMIR_")) &&
      (!x._1.endsWith("_RAW"))
    })
  }


  var db = prepareDatabase()
  var db_name = ""

  /*
   * Actions
   */
  def index = Action {
    try {
      db.backend.open()
      val result: WebResult = new WebStringResult("Query results show up here...")
      Ok(views.html.index(this, "", result, ""))
    }
    finally {
      db.backend.close()
    }
  }


  /**
   * Database selection handlers
   */
  def changeDB = Action { request =>

    val form = request.body.asFormUrlEncoded
    val newDBName = form.get("db").head

    if(!db_name.equalsIgnoreCase(newDBName)) {
      prepareDatabase(newDBName)
    }

    try {
      db.backend.open()
      Ok(views.html.index(this, "",
        new WebStringResult("Working database changed to "+newDBName), ""))
    }
    finally {
      db.backend.close()
    }

  }

  def createDB = Action { request =>

    val form = request.body.asFormUrlEncoded
    val newDBName = form.get("db").head

    prepareDatabase(newDBName)

    try {
      db.backend.open()
      db.initializeDBForMimir()
      Ok(views.html.index(this, "",
        new WebStringResult("Database "+newDBName+" successfully created."), ""))
    }
    finally {
      db.backend.close()
    }

  }

  /**
   * Query handlers
   */
  def query = Action { request =>
    try {
      db.backend.open()
      val form = request.body.asFormUrlEncoded
      val query = form.get("query")(0)

      val (statements, results) = handleStatements(query)

      Ok(views.html.index(this, query, results.last, statements.last.toString))
    }
    finally {
      db.backend.close()
    }
  }

  def nameForQuery(queryString: String) = Action {
    try {
      db.backend.open()

      val querySql = db.parse(queryString).last.asInstanceOf[Select]
      val queryRA = db.sql.convert(querySql)
      val name = QueryNamer.nameQuery(db.optimize(queryRA))

      Ok(
        Json.obj(
          "result" -> name
        )
      );

    } catch {
      case e: Throwable => {
        e.printStackTrace()
        InternalServerError("ERROR: "+e.getMessage())
      }
    }
    finally {
      db.backend.close()
    }
  }

  def schemaForQuery(queryString: String) = Action {
    try {
      db.backend.open()
      
      val querySql = db.parse(queryString).last.asInstanceOf[Select]
      val queryRA = db.sql.convert(querySql)

      val schema = 
        JSONBuilder.list(db.bestGuessSchema(queryRA).map({
            case (name, t) => JSONBuilder.dict(Map(
              "name" -> JSONBuilder.string(name),
              "type" -> JSONBuilder.string(Type.toString(t)) 
              ))
            })
          )

      Ok(schema)

    } catch {
      case e: Throwable => {
        e.printStackTrace()
        InternalServerError("ERROR: "+e.getMessage())
      }
    }
    finally {
      db.backend.close()
    }
  }

  def queryGet(query: String) = Action {
    try {
      db.backend.open()
      val (statements, results) = handleStatements(query)
      Ok(views.html.index(this, query, results.last, statements.last.toString))
    }
    finally {
      db.backend.close()
    }
  }

  def queryJson(query: String) = Action {
    try {
      db.backend.open()
      val (statements, results) = handleStatements(query)

      Ok(Json.toJson(results.last))
    }
    finally {
      db.backend.close()
    }
  }


  /**
   * Load CSV data handler
   */
  def loadTable = Action(parse.multipartFormData) { request =>
//    webAPI.synchronized(
    try {
      db.backend.open()

      request.body.file("file").map { csvFile =>
      val name = csvFile.filename
      val dir = play.Play.application().path().getAbsolutePath

      val newFile = new File(dir, name)
      csvFile.ref.moveTo(newFile, true)
      db.loadTable(name)
      newFile.delete()
    }

      val result: WebResult = new WebStringResult("CSV file loaded.")
      Ok(views.html.index(this, "", result, ""))
    }
    finally {
      db.backend.close()
    }
//    )
  }


  /**
   * Return a list of all tables
   */
  def getAllDatabases() = Action {
    Ok(Json.toJson(allDatabases))
  }

  /* This creates the TableOntology object and initializes the tree*/
  val obj: TableOntology = new TableOntology()

  def discover(element: String) = Action {
    val result = obj.returnResult(element)
    Ok(Json.toJson(result))
  }

  def discoverVisualization() = Action {
    val result = obj.treeToJsonString()
    Ok(Json.toJson(result))
  }

  def getRowExplain(query: String, row: String) = Action {
    try {
      db.backend.open()

      db.parse(query).last match {
        case s:Select => {
          val oper = db.sql.convert(s)
          val explanation = 
            db.explainRow(oper, RowIdPrimitive(row))

          Ok(explanation.toJSON)
        }
        case _ => 
          BadRequest("Not A Query: "+query)
      }
    }
    finally {
      db.backend.open()
    }
  }

  def getColExplain(query: String, row: String, colIndexString: String) = Action {
    try {
      db.backend.open()

      val colIndex = Integer.parseInt(colIndexString)

      db.parse(query).last match {
        case s:Select => {
          val oper = db.sql.convert(s)
          val schema = Typechecker.schemaOf(oper)
          val explanation = 
            db.explainCell(oper, RowIdPrimitive(row), schema(colIndex)._1)

          Ok(explanation.toJSON)
        }
        case _ => 
          BadRequest("Not A Query: "+query)
      }
    }
    finally {
      db.backend.open()
    }

  }
}
