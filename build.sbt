name := "mimirwebapp"

version := "0.2"

scalaVersion := "2.10.5"

lazy val mimircore = project

lazy val mimirwebapp = 
  project.in(file(".")).
    enablePlugins(play.PlayScala)

libraryDependencies ++= Seq(
  jdbc,
  cache,
  ws,
  specs2 % Test,
  "info.mimirdb" %% "mimir-core" % "0.2-SNAPSHOT",
  "info.mimirdb" % "jsqlparser" % "1.0.0"
)

resolvers += "Local Maven Repository" at "file://"+Path.userHome.absolutePath+"/.m2/repository"
resolvers += "scalaz-bintray" at "http://dl.bintray.com/scalaz/releases"
resolvers += "MimirDB" at "http://maven.mimirdb.info/"

// Play provides two styles of routers, one expects its actions to be injected, the
// other, legacy style, accesses its actions statically.
routesGenerator := InjectedRoutesGenerator

// logging
javaOptions in Test += "-Dlogger.file=conf/logback.xml"