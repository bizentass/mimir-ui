package controllers;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mashape.unirest.http.HttpResponse;
import com.mashape.unirest.http.JsonNode;
import com.mashape.unirest.http.Unirest;
import org.json.JSONObject;

import java.util.*;

public class TableOntology
{
    static HashMap<String,String> semanticTableMap;
    static HashMap<String, TreeNode> semanticTreeNodeMap;
    static TreeNode root;

    TableOntology() {

        // Hashmap to represent table - semantic meaning relations
        // Key is ontology label, value is database table
        semanticTableMap= new HashMap<>();
        semanticTableMap.put("product", "product");
        semanticTableMap.put("animal", "animal");

        // Initialize the tree
        root = new TreeNode("mimir", "null");

        root.children.add(new TreeNode("product",  "mimir"));
        root.children.add(new TreeNode("animal",  "mimir"));

        root.children.get(0).children.add(new TreeNode("object", "product"));
        root.children.get(0).children.add(new TreeNode("item", "product"));
        root.children.get(0).children.add(new TreeNode("merchandise", "product"));

        root.children.get(1).children.add(new TreeNode("cat", "animal"));
        root.children.get(1).children.add(new TreeNode("dog", "animal"));
        root.children.get(1).children.add(new TreeNode("ostrich", "animal"));
        root.children.get(1).children.add(new TreeNode("leopard", "animal"));

        // Map each semantic node to TreeNode
        semanticTreeNodeMap = new HashMap<>();
        semanticTreeNodeMap.put("product", root.children.get(0));
        semanticTreeNodeMap.put("animal", root.children.get(1));
    }

    public String returnResult(String targetString) throws Exception{

        String rootNodePresent = returnRootNodeIfPresent(targetString, semanticTreeNodeMap);

        /* First check if given string is present in the tree
        * else query OpenCyc, DBPedia, TwinwordTree
        * */
        if(rootNodePresent != null) {
            return rootNodePresent;
        } else {

            JsonArray twin_word_result = findTWMatch(targetString);

            Map<String, ArrayList<String>> contextMap = new HashMap<>();
            ArrayList<String> contextList = new ArrayList<>();
            for (int i = 0; i < twin_word_result.size(); i++) {
                String contextValues = twin_word_result.get(i).getAsString();
                contextList.add(contextValues);
            }
            contextMap.put(targetString, contextList);

            // Add searched node to the ontology tree here
            ArrayList<String> elementsToSearch = contextMap.get(targetString);
            for(String element : elementsToSearch) {
                rootNodePresent = returnRootNodeIfPresent(element,semanticTreeNodeMap);
                if(rootNodePresent != null) {
                    TreeNode newParentNode = new TreeNode(rootNodePresent, root.getName());
                    TreeNode newNode = new TreeNode(targetString, rootNodePresent);
                    newParentNode.children.add(newNode);
                    mergeNewTree(newParentNode, root);
                    return rootNodePresent;
                }
            }
        }

        return null;

    }

    public String returnRootNodeIfPresent(String targetString, HashMap<String, TreeNode>  semanticTreeNodeMap) {

        for(String matchingString : semanticTreeNodeMap.keySet()) {
            if (targetString.equals(matchingString)) {
                return matchingString;
            }
        }

        TreeNode targetNode = new TreeNode(targetString);
        for(TreeNode subTree: semanticTreeNodeMap.values()) {
            if(covers(targetNode,subTree)){
                return subTree.name;
            }
        }

        return null;
    }

    public boolean mergeNewTree(TreeNode root2, TreeNode root){

        if(root == null){
            return false;
        }

        TreeNode temporaryNode = root;
        if(temporaryNode.name != root2.name){
            for(int i = 0; i<temporaryNode.children.size(); ++i){
                boolean b = mergeNewTree(root2, temporaryNode.children.get(i));
                if(b){
                    return true;
                }
            }
        } else {
            temporaryNode.children.add(root2.children.get(0));
        }

        return false;

    }


    public TreeNode LCA(TreeNode p, TreeNode q, TreeNode root){

        if(p == null){
            return q;
        }

        if(q == null){
            return p;
        }

        if(p == root || q == root){
            return root;
        }

        boolean pIsOnOneIndex = false, qIsOnOneIndex = false;

        for(int i = 0; i<root.children.size(); ++i){
            pIsOnOneIndex = covers(p, root.children.get(i));
            qIsOnOneIndex = covers(q, root.children.get(i));

            if(pIsOnOneIndex != qIsOnOneIndex){
                return root;
            }

            if(pIsOnOneIndex){
                return LCA(p, q, root.children.get(i));
            }
        }

        return root;
    }

    public boolean covers(TreeNode p, TreeNode root){
        if(root == null){
            return false;
        }

        if(root.name.equals(p.name)){
            return true;
        }

        boolean temp = false;
        for(int i = 0; i<root.children.size(); ++i){
            temp = covers(p, root.children.get(i));
            if(temp){
                return true;
            }
        }

        return false;
    }

    private JsonArray findTWMatch(String element) throws Exception {

        String url = "https://twinword-visual-context-graph.p.mashape.com/visualize/?entry=" + element;
        HttpResponse<JsonNode> response = Unirest.get(url)
                .header("X-Mashape-Key", "YspiBejvV1mshqk1ZrFCGdaux7qCp1lQUzxjsnN3Xkt4UrvSJH")
                .header("Accept", "application/json")
                .asJson();

        JSONObject jsonObject = response.getBody().getObject();
        JsonParser jsonParser = new JsonParser();
        JsonObject gsonObject = (JsonObject)jsonParser.parse(jsonObject.toString());

        JsonArray a = gsonObject.getAsJsonArray("context");

        return a;
    }

    public String treeToJsonString(){

        Gson gson = new Gson();
        String json = gson.toJson(root);

        return json;
    }

}

class TreeNode{

    String name;
    String parent;
    ArrayList<TreeNode> children;

    public TreeNode(String name){
        this.name = name;
        children = new ArrayList<>();
    }

    public TreeNode(String name, String parent){
        this.name = name;
        this.parent = parent;
        children = new ArrayList<>();
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getParent() {
        return parent;
    }

    public void setParent(String parent) {
        this.parent = parent;
    }

    public ArrayList<TreeNode> getChildren() {
        return children;
    }

    public void setChildren(ArrayList<TreeNode> children) {
        this.children = children;
    }

    @Override
    public String toString() {
        return "TreeNode{" +
                "name='" + name + '\'' +
                ", parent='" + parent + '\'' +
                ", children=" + children +
                '}';
    }
}