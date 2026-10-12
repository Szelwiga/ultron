# Doki root Makefile

BUILD_DIR = run/build
GEN_SRC_DIR = $(BUILD_DIR)/gen
CLASSES_DIR = $(BUILD_DIR)/classes
JAR_FILE = $(BUILD_DIR)/doki.jar

PROTO_JAR = /usr/share/java/protobuf.jar
PROTO_UTIL_JAR = /usr/share/java/protobuf-util.jar
CLASSPATH = $(PROTO_JAR):$(PROTO_UTIL_JAR)

PROTOS = $(shell find proto -name "*.proto")
JAVA_SRCS = $(shell find java -name "*.java" 2>/dev/null)

.PHONY: all proto compile jar run clean test

all: jar

$(GEN_SRC_DIR):
	mkdir -p $(GEN_SRC_DIR)

$(CLASSES_DIR):
	mkdir -p $(CLASSES_DIR)

proto: $(GEN_SRC_DIR) $(PROTOS)
	protoc -I=proto --java_out=$(GEN_SRC_DIR) $(PROTOS)

compile: proto $(CLASSES_DIR)
	javac -cp "$(CLASSPATH)" -d $(CLASSES_DIR) \
		$$(find $(GEN_SRC_DIR) java integration -name "*.java")

jar: compile
	echo "Main-Class: com.doki.ultron.Main" > $(BUILD_DIR)/manifest.txt
	echo "Class-Path: $(PROTO_JAR) $(PROTO_UTIL_JAR)" >> $(BUILD_DIR)/manifest.txt
	jar cfm $(JAR_FILE) $(BUILD_DIR)/manifest.txt -C $(CLASSES_DIR) .

run: jar
	java -jar $(JAR_FILE)

test: compile
	java -cp "$(CLASSPATH):$(CLASSES_DIR)" com.doki.integration.AuthIntegrationTest

clean:
	rm -rf $(BUILD_DIR)
